import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { campanha_id } = body;

    if (!campanha_id) {
      return new Response(JSON.stringify({ error: "campanha_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get campaign
    const { data: campanha, error: campError } = await serviceClient
      .from("campanhas")
      .select("*")
      .eq("id", campanha_id)
      .single();

    if (campError || !campanha) {
      return new Response(JSON.stringify({ error: "Campanha não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Z-API config
    const { data: zapiConfig } = await serviceClient
      .from("zapi_config")
      .select("instance_id, token, client_token")
      .eq("tenant_id", campanha.tenant_id)
      .single();

    if (!zapiConfig) {
      return new Response(JSON.stringify({ error: "Z-API não configurado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark campaign as sending
    await serviceClient
      .from("campanhas")
      .update({ status: "enviando" })
      .eq("id", campanha_id);

    // Get pending recipients
    const { data: destinatarios } = await serviceClient
      .from("campanha_destinatarios")
      .select("*, contatos:contato_id(nome)")
      .eq("campanha_id", campanha_id)
      .eq("status", "pendente");

    if (!destinatarios || destinatarios.length === 0) {
      await serviceClient
        .from("campanhas")
        .update({ status: "concluida" })
        .eq("id", campanha_id);

      return new Response(JSON.stringify({ message: "Nenhum destinatário pendente" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let enviados = campanha.total_enviados || 0;
    let falhas = campanha.total_falhas || 0;

    for (const dest of destinatarios) {
      try {
        const nome = (dest.contatos as any)?.nome || "";
        const mensagemFinal = campanha.mensagem
          .replace(/\{nome\}/gi, nome)
          .replace(/\{telefone\}/gi, dest.telefone);

        const zapiUrl = `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`;

        const phone = dest.telefone.replace(/\D/g, "");

        const zapiResponse = await fetch(zapiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Client-Token": zapiConfig.client_token,
          },
          body: JSON.stringify({
            phone,
            message: mensagemFinal,
          }),
        });

        if (zapiResponse.ok) {
          await serviceClient
            .from("campanha_destinatarios")
            .update({ status: "enviado", enviado_at: new Date().toISOString() })
            .eq("id", dest.id);
          enviados++;
        } else {
          const errBody = await zapiResponse.text();
          await serviceClient
            .from("campanha_destinatarios")
            .update({ status: "falha", erro: errBody.substring(0, 500) })
            .eq("id", dest.id);
          falhas++;
        }
      } catch (err) {
        await serviceClient
          .from("campanha_destinatarios")
          .update({ status: "falha", erro: (err as Error).message?.substring(0, 500) })
          .eq("id", dest.id);
        falhas++;
      }

      // Update counters periodically
      await serviceClient
        .from("campanhas")
        .update({ total_enviados: enviados, total_falhas: falhas })
        .eq("id", campanha_id);

      // Anti-ban delay: 2-4 seconds
      const delay = 2000 + Math.random() * 2000;
      await new Promise((r) => setTimeout(r, delay));
    }

    // Mark as completed
    await serviceClient
      .from("campanhas")
      .update({ status: "concluida", total_enviados: enviados, total_falhas: falhas })
      .eq("id", campanha_id);

    return new Response(
      JSON.stringify({ message: "Campanha concluída", enviados, falhas }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("enviar-campanha error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
