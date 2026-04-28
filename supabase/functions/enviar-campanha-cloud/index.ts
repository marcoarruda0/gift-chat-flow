import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";

const ATRASO_RANGES: Record<string, [number, number]> = {
  muito_curto: [1000, 5000],
  curto: [5000, 20000],
  medio: [20000, 60000],
  longo: [60000, 180000],
  muito_longo: [180000, 300000],
};

// Resolve {nome}, {telefone}, {email}, {cpf} and custom fields from the contato
function resolveVariable(template: string, contato: any): string {
  if (!template) return "";
  let out = template;
  const replacements: Record<string, string> = {
    nome: contato?.nome || "",
    telefone: contato?.telefone || "",
    email: contato?.email || "",
    cpf: contato?.cpf || "",
    endereco: contato?.endereco || "",
    opt_out_url: contato?.opt_out_url || "",
  };
  for (const [k, v] of Object.entries(replacements)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "gi"), v);
  }
  // custom fields
  const custom = contato?.campos_personalizados || {};
  for (const [k, v] of Object.entries(custom)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "gi"), String(v ?? ""));
  }
  return out;
}

// Extract {{n}} placeholders from a string
function extractPlaceholders(text: string): number[] {
  const matches = (text || "").matchAll(/\{\{(\d+)\}\}/g);
  const nums = new Set<number>();
  for (const m of matches) nums.add(parseInt(m[1], 10));
  return Array.from(nums).sort((a, b) => a - b);
}

function buildTemplateComponents(
  templateComponents: any[],
  variaveis: Record<string, string>,
  contato: any
): any[] {
  const out: any[] = [];

  for (const comp of templateComponents || []) {
    const type = String(comp.type || "").toUpperCase();

    if (type === "HEADER") {
      const format = String(comp.format || "TEXT").toUpperCase();
      if (format === "TEXT") {
        const placeholders = extractPlaceholders(comp.text || "");
        if (placeholders.length === 0) continue;
        out.push({
          type: "header",
          parameters: placeholders.map((n) => ({
            type: "text",
            text: resolveVariable(variaveis[`header.${n}`] || "", contato),
          })),
        });
      } else if (format === "IMAGE" && comp.media_url) {
        out.push({
          type: "header",
          parameters: [{ type: "image", image: { link: comp.media_url } }],
        });
      } else if (format === "VIDEO" && comp.media_url) {
        out.push({
          type: "header",
          parameters: [{ type: "video", video: { link: comp.media_url } }],
        });
      }
      // Outros formatos sem suporte: pulamos.
    } else if (type === "BODY") {
      const placeholders = extractPlaceholders(comp.text || "");
      if (placeholders.length === 0) continue;
      out.push({
        type: "body",
        parameters: placeholders.map((n) => ({
          type: "text",
          text: resolveVariable(variaveis[`body.${n}`] || "", contato),
        })),
      });
    }
    // FOOTER and BUTTONS with no params: nothing to send
  }

  return out;
}

function buildPreviewText(templateComponents: any[], variaveis: Record<string, string>, contato: any): string {
  const body = (templateComponents || []).find((c: any) => String(c.type || "").toUpperCase() === "BODY");
  if (!body?.text) return "";
  let txt = body.text as string;
  const placeholders = extractPlaceholders(txt);
  for (const n of placeholders) {
    const raw = variaveis[`body.${n}`] || "";
    const val = resolveVariable(raw, contato);
    txt = txt.split(`{{${n}}}`).join(val);
  }
  return txt;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { campanha_id, internal, remaining_delay_ms } = body;

    // Auth
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

    if (campanha.canal !== "whatsapp_cloud") {
      return new Response(
        JSON.stringify({ error: "Esta campanha não é do canal WhatsApp Oficial" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (campanha.status === "cancelada") {
      return new Response(JSON.stringify({ message: "Campanha cancelada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!campanha.template_name || !campanha.template_language) {
      return new Response(
        JSON.stringify({ error: "Campanha sem template configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === DELAY chunked (same pattern as enviar-campanha) ===
    if (internal) {
      const MAX_SLEEP = 120000;
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const functionUrl = `${supabaseUrl}/functions/v1/enviar-campanha-cloud`;

      let remainingDelay = remaining_delay_ms ?? 0;

      if (remainingDelay <= 0) {
        const [delayMin, delayMax] = ATRASO_RANGES[campanha.atraso_tipo] || ATRASO_RANGES.medio;
        remainingDelay = delayMin + Math.random() * (delayMax - delayMin);
      }

      console.log(`[cloud] Delay: ${Math.round(remainingDelay / 1000)}s remaining`);

      if (remainingDelay > 0) {
        const sleepTime = Math.min(remainingDelay, MAX_SLEEP);
        await new Promise((r) => setTimeout(r, sleepTime));
        remainingDelay -= sleepTime;

        const { data: freshCampanha } = await serviceClient
          .from("campanhas")
          .select("status")
          .eq("id", campanha_id)
          .single();

        if (freshCampanha?.status === "cancelada") {
          return new Response(JSON.stringify({ message: "Campanha cancelada" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (remainingDelay > 0) {
          fetch(functionUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ campanha_id, internal: true, remaining_delay_ms: remainingDelay }),
          }).catch((err) => console.error("Failed to chain delay:", err));

          return new Response(JSON.stringify({ message: "Delay in progress" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Fetch Cloud config
    const { data: cloudConfig } = await serviceClient
      .from("whatsapp_cloud_config")
      .select("phone_number_id, access_token, status")
      .eq("tenant_id", campanha.tenant_id)
      .single();

    if (!cloudConfig?.phone_number_id || !cloudConfig?.access_token) {
      return new Response(
        JSON.stringify({ error: "WhatsApp Oficial não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!internal) {
      await serviceClient
        .from("campanhas")
        .update({ status: "enviando" })
        .eq("id", campanha_id);
    }

    // Fetch ONE pending recipient with full contato
    const { data: destinatarios } = await serviceClient
      .from("campanha_destinatarios")
      .select("*, contatos:contato_id(*)")
      .eq("campanha_id", campanha_id)
      .eq("status", "pendente")
      .limit(1);

    if (!destinatarios || destinatarios.length === 0) {
      await serviceClient
        .from("campanhas")
        .update({ status: "concluida" })
        .eq("id", campanha_id);

      return new Response(JSON.stringify({ message: "Campanha concluída" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dest = destinatarios[0];
    const contato = dest.contatos as any;

    // Pular contatos com opt-out: marca como 'optout' e segue
    if (contato?.opt_out_whatsapp) {
      await serviceClient
        .from("campanha_destinatarios")
        .update({ status: "optout", erro: "Contato descadastrado (opt-out)" })
        .eq("id", dest.id);
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const functionUrl = `${supabaseUrl}/functions/v1/enviar-campanha-cloud`;
      fetch(functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ campanha_id, internal: true, remaining_delay_ms: 0 }),
      }).catch(() => {});
      return new Response(JSON.stringify({ message: "Skipped opt-out" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let enviados = campanha.total_enviados || 0;
    let falhas = campanha.total_falhas || 0;

    const variaveis = { ...(campanha.template_variaveis || {}) } as Record<string, string>;
    const templateComponents = (campanha.template_components || []) as any[];

    // Gerar opt_out_url (token único por destinatário)
    let optOutUrl = "";
    try {
      const { data: tk } = await serviceClient
        .from("optout_tokens")
        .insert({ tenant_id: campanha.tenant_id, contato_id: dest.contato_id, campanha_id })
        .select("token")
        .single();
      if (tk?.token) {
        optOutUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/optout-publica?token=${tk.token}`;
        if (contato) contato.opt_out_url = optOutUrl;
        // Substitui {opt_out_url} em todas as variáveis configuradas pelo usuário
        for (const k of Object.keys(variaveis)) {
          variaveis[k] = String(variaveis[k] || "").replace(/\{opt_out_url\}/gi, optOutUrl);
        }
      }
    } catch (err) {
      console.error("[cloud] falha gerando opt_out_url:", err);
    }


    try {
      const phone = String(dest.telefone || "").replace(/\D/g, "");
      if (!phone) throw new Error("Telefone inválido");

      const components = buildTemplateComponents(templateComponents, variaveis, contato);
      const previewText = buildPreviewText(templateComponents, variaveis, contato);

      const payload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: campanha.template_name,
          language: { code: campanha.template_language },
          components,
        },
      };

      const graphUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${cloudConfig.phone_number_id}/messages`;
      const graphRes = await fetch(graphUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cloudConfig.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const graphData = await graphRes.json();

      if (graphRes.ok && graphData?.messages?.[0]?.id) {
        const waMessageId = graphData.messages[0].id;

        await serviceClient
          .from("campanha_destinatarios")
          .update({
            status: "enviado",
            enviado_at: new Date().toISOString(),
            wa_message_id: waMessageId,
            status_entrega: "sent",
            status_entrega_at: new Date().toISOString(),
            delivery_error: null,
          })
          .eq("id", dest.id);
        enviados++;

        // Register message in conversas module for unified history
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
                canal: "whatsapp_cloud",
                whatsapp_cloud_phone_id: cloudConfig.phone_number_id,
              })
              .select("id")
              .single();
            conversaId = newConv!.id;
          }

          await serviceClient.from("mensagens").insert({
            conversa_id: conversaId,
            tenant_id: campanha.tenant_id,
            conteudo: previewText || `[Template: ${campanha.template_name}]`,
            remetente: "atendente",
            tipo: "template",
            status_entrega: "sent",
            status_entrega_at: new Date().toISOString(),
            metadata: {
              fromCampanha: campanha.nome,
              campanha_id: campanha.id,
              wa_message_id: waMessageId,
              template_name: campanha.template_name,
              template_language: campanha.template_language,
            },
          });

          await serviceClient.from("conversas").update({
            ultimo_texto: (previewText || `[Template: ${campanha.template_name}]`).slice(0, 80),
            ultima_msg_at: new Date().toISOString(),
          }).eq("id", conversaId);
        } catch (convErr) {
          console.error("[cloud] Failed to log message to conversas:", convErr);
        }
      } else {
        const errorPayload = graphData?.error || { message: JSON.stringify(graphData).slice(0, 500) };
        const errMsg = errorPayload.error_user_msg || errorPayload.message || "Erro Meta";
        await serviceClient
          .from("campanha_destinatarios")
          .update({
            status: "falha",
            erro: String(errMsg).substring(0, 500),
            status_entrega: "failed",
            status_entrega_at: new Date().toISOString(),
            delivery_error: errorPayload,
          })
          .eq("id", dest.id);
        falhas++;
      }
    } catch (err) {
      const msg = (err as Error).message || "Erro desconhecido";
      await serviceClient
        .from("campanha_destinatarios")
        .update({
          status: "falha",
          erro: msg.substring(0, 500),
          status_entrega: "failed",
          status_entrega_at: new Date().toISOString(),
          delivery_error: { message: msg },
        })
        .eq("id", dest.id);
      falhas++;
    }

    // Update campaign counters
    await serviceClient
      .from("campanhas")
      .update({ total_enviados: enviados, total_falhas: falhas })
      .eq("id", campanha_id);

    // Check if there are more pending
    const { count } = await serviceClient
      .from("campanha_destinatarios")
      .select("id", { count: "exact", head: true })
      .eq("campanha_id", campanha_id)
      .eq("status", "pendente");

    if (count && count > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const functionUrl = `${supabaseUrl}/functions/v1/enviar-campanha-cloud`;

      console.log(`[cloud] Triggering next invocation (${count} remaining)`);

      fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ campanha_id, internal: true }),
      }).catch((err) => console.error("Failed to trigger next:", err));
    } else {
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
    console.error("enviar-campanha-cloud error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
