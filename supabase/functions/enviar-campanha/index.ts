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
    const body = await req.json();
    const { campanha_id, internal, remaining_delay_ms } = body;

    // Auth: internal calls use service role key, external calls need user auth
    if (!internal) {
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
    }

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

    // Fetch campaign
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

    // If campaign was cancelled, stop processing
    if (campanha.status === "cancelada") {
      return new Response(JSON.stringify({ message: "Campanha cancelada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === DELAY: internal calls sleep BEFORE processing ===
    if (internal) {
      const [delayMin, delayMax] = ATRASO_RANGES[campanha.atraso_tipo] || ATRASO_RANGES.medio;
      const delay = delayMin + Math.random() * (delayMax - delayMin);
      console.log(`Waiting ${Math.round(delay / 1000)}s before next send...`);
      await new Promise((r) => setTimeout(r, delay));

      // Re-check if cancelled during the wait
      const { data: freshCampanha } = await serviceClient
        .from("campanhas")
        .select("status")
        .eq("id", campanha_id)
        .single();

      if (freshCampanha?.status === "cancelada") {
        console.log("Campanha cancelled during delay, stopping.");
        return new Response(JSON.stringify({ message: "Campanha cancelada" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch Z-API config
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

    // Mark as sending on first call
    if (!internal) {
      await serviceClient
        .from("campanhas")
        .update({ status: "enviando" })
        .eq("id", campanha_id);
    }

    // Fetch ONE pending recipient
    const { data: destinatarios } = await serviceClient
      .from("campanha_destinatarios")
      .select("*, contatos:contato_id(nome)")
      .eq("campanha_id", campanha_id)
      .eq("status", "pendente")
      .limit(1);

    if (!destinatarios || destinatarios.length === 0) {
      // No more pending — mark campaign as done
      await serviceClient
        .from("campanhas")
        .update({ status: "concluida" })
        .eq("id", campanha_id);

      return new Response(JSON.stringify({ message: "Campanha concluída" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dest = destinatarios[0];
    let enviados = campanha.total_enviados || 0;
    let falhas = campanha.total_falhas || 0;
    const tipoMidia = campanha.tipo_midia || "texto";
    const midiaUrl = campanha.midia_url || null;

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

        // Register message in conversas module
        try {
          let conversaId: string;
          const { data: existingConv } = await serviceClient
            .from("conversas")
            .select("id")
            .eq("tenant_id", campanha.tenant_id)
            .eq("contato_id", dest.contato_id)
            .eq("status", "aberta")
            .limit(1)
            .maybeSingle();

          if (existingConv) {
            conversaId = existingConv.id;
          } else {
            const { data: newConv } = await serviceClient
              .from("conversas")
              .insert({
                tenant_id: campanha.tenant_id,
                contato_id: dest.contato_id,
                status: "aberta",
              })
              .select("id")
              .single();
            conversaId = newConv!.id;
          }

          const tipoMsg = tipoMidia === "texto" ? "texto" : tipoMidia;
          await serviceClient.from("mensagens").insert({
            conversa_id: conversaId,
            tenant_id: campanha.tenant_id,
            conteudo: mensagemFinal,
            remetente: "atendente",
            tipo: tipoMsg,
            metadata: { fromCampanha: campanha.nome },
          });

          await serviceClient.from("conversas").update({
            ultimo_texto: mensagemFinal.slice(0, 80),
            ultima_msg_at: new Date().toISOString(),
          }).eq("id", conversaId);
        } catch (convErr) {
          console.error("Failed to log message to conversas:", convErr);
        }
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

    // Update campaign counters
    await serviceClient
      .from("campanhas")
      .update({ total_enviados: enviados, total_falhas: falhas })
      .eq("id", campanha_id);

    // Check if there are more pending recipients
    const { count } = await serviceClient
      .from("campanha_destinatarios")
      .select("id", { count: "exact", head: true })
      .eq("campanha_id", campanha_id)
      .eq("status", "pendente");

    if (count && count > 0) {
      // Fire-and-forget: trigger next invocation IMMEDIATELY
      // The next invocation will sleep at the start before processing
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const functionUrl = `${supabaseUrl}/functions/v1/enviar-campanha`;

      console.log(`Triggering next invocation immediately (${count} remaining)`);

      fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ campanha_id, internal: true }),
      }).catch((err) => {
        console.error("Failed to trigger next invocation:", err);
      });
    } else {
      // All done
      await serviceClient
        .from("campanhas")
        .update({ status: "concluida", total_enviados: enviados, total_falhas: falhas })
        .eq("id", campanha_id);
    }

    return new Response(
      JSON.stringify({ message: "Destinatário processado", enviados, falhas, remaining: count || 0 }),
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
