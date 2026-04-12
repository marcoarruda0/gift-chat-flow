import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getZapiEndpointAndBody(
  tipoMidia: string,
  midiaUrl: string | null,
  mensagemFinal: string,
  phone: string
) {
  switch (tipoMidia) {
    case "imagem":
      return {
        endpoint: "send-image",
        body: { phone, image: midiaUrl, caption: mensagemFinal || undefined },
      };
    case "audio":
      return {
        endpoint: "send-audio",
        body: { phone, audio: midiaUrl },
      };
    case "video":
      return {
        endpoint: "send-video",
        body: { phone, video: midiaUrl, caption: mensagemFinal || undefined },
      };
    case "documento": {
      const fileName = midiaUrl?.split("/").pop() || "arquivo";
      return {
        endpoint: "send-document",
        body: { phone, document: midiaUrl, fileName, caption: mensagemFinal || undefined },
      };
    }
    default:
      return {
        endpoint: "send-text",
        body: { phone, message: mensagemFinal },
      };
  }
}

const ATRASO_RANGES: Record<string, [number, number]> = {
  muito_curto: [1000, 5000],
  curto: [5000, 20000],
  medio: [20000, 60000],
  longo: [60000, 180000],
  muito_longo: [180000, 300000],
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

    await serviceClient
      .from("campanhas")
      .update({ status: "enviando" })
      .eq("id", campanha_id);

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
    const tipoMidia = campanha.tipo_midia || "texto";
    const midiaUrl = campanha.midia_url || null;

    const [delayMin, delayMax] = ATRASO_RANGES[campanha.atraso_tipo] || ATRASO_RANGES.medio;

    for (let i = 0; i < destinatarios.length; i++) {
      const dest = destinatarios[i];

      // First message sends immediately, subsequent ones wait
      if (i > 0) {
        const delay = delayMin + Math.random() * (delayMax - delayMin);
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        const nome = (dest.contatos as any)?.nome || "";
        const mensagemFinal = campanha.mensagem
          .replace(/\{nome\}/gi, nome)
          .replace(/\{telefone\}/gi, dest.telefone);

        const phone = dest.telefone.replace(/\D/g, "");

        const { endpoint, body: zapiBody } = getZapiEndpointAndBody(
          tipoMidia,
          midiaUrl,
          mensagemFinal,
          phone
        );

        const zapiUrl = `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/${endpoint}`;

        const zapiResponse = await fetch(zapiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Client-Token": zapiConfig.client_token,
          },
          body: JSON.stringify(zapiBody),
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

      await serviceClient
        .from("campanhas")
        .update({ total_enviados: enviados, total_falhas: falhas })
        .eq("id", campanha_id);
    }

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
