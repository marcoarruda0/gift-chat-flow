import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";

Deno.serve(async (req) => {
  // Log EVERY hit (so we can prove if Meta is calling at all)
  const reqUrl = new URL(req.url);
  console.log("[whatsapp-cloud-webhook] HIT", {
    method: req.method,
    path: reqUrl.pathname,
    search: reqUrl.search,
    ip:
      req.headers.get("x-forwarded-for") ||
      req.headers.get("cf-connecting-ip") ||
      "unknown",
    ua: req.headers.get("user-agent"),
  });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // GET → Meta verification handshake
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    console.log("[whatsapp-cloud-webhook] GET verify", { mode, hasToken: !!token });

    if (mode !== "subscribe" || !token) {
      return new Response("Bad Request", { status: 400 });
    }

    const { data: match } = await serviceClient
      .from("whatsapp_cloud_config")
      .select("id")
      .eq("verify_token", token)
      .maybeSingle();

    if (match) {
      // Mark verification timestamp for diagnostics
      await serviceClient
        .from("whatsapp_cloud_config")
        .update({ ultima_verificacao_at: new Date().toISOString() })
        .eq("id", match.id);

      return new Response(challenge ?? "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    return new Response("Forbidden", { status: 403 });
  }

  // POST → incoming events from Meta
  if (req.method === "POST") {
    let rawBody = "";
    let body: any = {};
    let auditId: string | null = null;
    let auditTenantId: string | null = null;
    let auditPhoneNumberId: string | null = null;

    try {
      rawBody = await req.text();
      console.log("[whatsapp-cloud-webhook] POST raw", rawBody.slice(0, 1200));

      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch (parseErr) {
        console.error("[whatsapp-cloud-webhook] body is not JSON", parseErr);
        return new Response("ok", { status: 200 });
      }

      // Try to extract phone_number_id for audit early
      const firstChange = body?.entry?.[0]?.changes?.[0];
      auditPhoneNumberId = firstChange?.value?.metadata?.phone_number_id ?? null;

      if (auditPhoneNumberId) {
        const { data: cfgEarly } = await serviceClient
          .from("whatsapp_cloud_config")
          .select("tenant_id")
          .eq("phone_number_id", auditPhoneNumberId)
          .maybeSingle();
        auditTenantId = cfgEarly?.tenant_id ?? null;
      }

      // Insert audit row BEFORE processing
      const { data: auditRow } = await serviceClient
        .from("whatsapp_webhook_eventos")
        .insert({
          tenant_id: auditTenantId,
          phone_number_id: auditPhoneNumberId,
          payload: body,
          status: "recebido",
        })
        .select("id")
        .maybeSingle();
      auditId = auditRow?.id ?? null;

      const result = await processWebhookPayload(serviceClient, body);

      if (auditId) {
        await serviceClient
          .from("whatsapp_webhook_eventos")
          .update({
            status: result.error ? "erro" : "processado",
            erro_mensagem: result.error,
            mensagens_criadas: result.mensagensCriadas,
            conversas_criadas: result.conversasCriadas,
            tenant_id: auditTenantId ?? result.tenantId ?? null,
            processado_at: new Date().toISOString(),
          })
          .eq("id", auditId);
      }
    } catch (e) {
      console.error("[whatsapp-cloud-webhook] failed to process body", e);
      if (auditId) {
        await serviceClient
          .from("whatsapp_webhook_eventos")
          .update({
            status: "erro",
            erro_mensagem: (e as Error).message,
            processado_at: new Date().toISOString(),
          })
          .eq("id", auditId);
      }
    }
    // Always return 200 quickly so Meta doesn't retry
    return new Response("ok", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
});

// Exported for reuse by reprocessing function (called via direct import in Deno)
export async function processWebhookPayload(
  serviceClient: any,
  body: any
): Promise<{ mensagensCriadas: number; conversasCriadas: number; error: string | null; tenantId: string | null }> {
  let mensagensCriadas = 0;
  let conversasCriadas = 0;
  let error: string | null = null;
  let tenantIdOut: string | null = null;

  const entries = body.entry || [];
  console.log("[whatsapp-cloud-webhook] entries:", entries.length);

  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value || {};
      const phoneNumberId: string | undefined = value.metadata?.phone_number_id;
      const messages = value.messages || [];
      const contacts = value.contacts || [];
      const statuses = value.statuses || [];

      console.log("[whatsapp-cloud-webhook] change", {
        field: change.field,
        phoneNumberId,
        messages: messages.length,
        statuses: statuses.length,
        contacts: contacts.length,
      });

      if (change.field !== "messages") continue;
      if (!phoneNumberId) {
        error = error ?? "no_phone_number_id";
        continue;
      }

      const { data: cfg } = await serviceClient
        .from("whatsapp_cloud_config")
        .select("tenant_id, phone_number_id, access_token")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();

      if (!cfg) {
        error = error ?? `no_tenant_for_phone_${phoneNumberId}`;
        continue;
      }

      const tenantId = cfg.tenant_id;
      tenantIdOut = tenantId;
      const accessToken = cfg.access_token;

      await serviceClient
        .from("whatsapp_cloud_config")
        .update({ ultima_mensagem_at: new Date().toISOString() })
        .eq("phone_number_id", phoneNumberId);

      for (const msg of messages) {
        try {
          const r = await processIncomingMessage(
            serviceClient,
            tenantId,
            phoneNumberId,
            accessToken,
            msg,
            contacts
          );
          mensagensCriadas += r.mensagemCriada ? 1 : 0;
          conversasCriadas += r.conversaCriada ? 1 : 0;
        } catch (e) {
          console.error("[whatsapp-cloud-webhook] processIncomingMessage failed", e);
          error = error ?? (e as Error).message;
        }
      }

      for (const status of statuses) {
        try {
          await processStatusUpdate(serviceClient, tenantId, status);
        } catch (e) {
          console.error("[whatsapp-cloud-webhook] processStatusUpdate failed", e);
        }
      }
    }
  }

  return { mensagensCriadas, conversasCriadas, error, tenantId: tenantIdOut };
}

// ====== Helpers ======

async function processIncomingMessage(
  supabase: any,
  tenantId: string,
  phoneNumberId: string,
  accessToken: string,
  msg: any,
  contacts: any[]
): Promise<{ mensagemCriada: boolean; conversaCriada: boolean }> {
  const waMessageId: string = msg.id;
  const fromPhone: string = msg.from; // E.164 sem '+'
  const type: string = msg.type;

  if (!waMessageId || !fromPhone) {
    console.warn("[whatsapp-cloud-webhook] missing id/from", msg);
    return { mensagemCriada: false, conversaCriada: false };
  }

  // Dedup
  const { data: existing } = await supabase
    .from("mensagens")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("metadata->>wa_message_id", waMessageId)
    .limit(1);
  if (existing && existing.length > 0) {
    console.log("[whatsapp-cloud-webhook] duplicate, skip", waMessageId);
    return { mensagemCriada: false, conversaCriada: false };
  }

  // Contact name from contacts[]
  const contactInfo = contacts.find((c: any) => c.wa_id === fromPhone);
  const contactName = contactInfo?.profile?.name || fromPhone;

  const contato = await findOrCreateContact(supabase, tenantId, fromPhone, contactName);
  if (!contato) {
    console.error("[whatsapp-cloud-webhook] could not create contact");
    return { mensagemCriada: false, conversaCriada: false };
  }

  const convResult = await findOrCreateConversa(supabase, tenantId, contato.id, phoneNumberId);
  if (!convResult?.conversa) {
    console.error("[whatsapp-cloud-webhook] could not create conversa");
    return { mensagemCriada: false, conversaCriada: false };
  }
  const conversa = convResult.conversa;
  const conversaCriada = convResult.created;

  const { conteudo, tipo, previewText, mediaInfo } = await parseMetaMessage(
    msg,
    type,
    accessToken,
    supabase,
    tenantId
  );

  await supabase.from("mensagens").insert({
    conversa_id: conversa.id,
    tenant_id: tenantId,
    conteudo,
    remetente: "contato",
    tipo,
    metadata: {
      wa_message_id: waMessageId,
      wa_type: type,
      senderName: contactName,
      ...mediaInfo,
    },
  });

  const { data: cur } = await supabase
    .from("conversas")
    .select("nao_lidas")
    .eq("id", conversa.id)
    .single();

  await supabase
    .from("conversas")
    .update({
      ultimo_texto: previewText.slice(0, 100),
      ultima_msg_at: new Date().toISOString(),
      nao_lidas: (cur?.nao_lidas || 0) + 1,
      status: "aberta",
    })
    .eq("id", conversa.id);

  console.log("[whatsapp-cloud-webhook] message saved", { conversa: conversa.id, type });
  return { mensagemCriada: true, conversaCriada };
}

async function parseMetaMessage(
  msg: any,
  type: string,
  accessToken: string,
  supabase: any,
  tenantId: string
): Promise<{ conteudo: string; tipo: string; previewText: string; mediaInfo: Record<string, any> }> {
  if (type === "text") {
    const text = msg.text?.body || "";
    return { conteudo: text, tipo: "texto", previewText: text, mediaInfo: {} };
  }

  if (type === "interactive") {
    // button_reply or list_reply
    const inter = msg.interactive || {};
    const reply = inter.button_reply || inter.list_reply;
    const text = reply?.title || reply?.id || "[interação]";
    return {
      conteudo: text,
      tipo: "texto",
      previewText: text,
      mediaInfo: { interactive: inter },
    };
  }

  if (["image", "audio", "video", "document", "sticker"].includes(type)) {
    const media = msg[type] || {};
    const mediaId: string | undefined = media.id;
    const caption: string = media.caption || "";
    const mimeType: string = media.mime_type || "";
    let publicUrl = "";

    if (mediaId) {
      try {
        publicUrl = await downloadAndStoreMedia(
          accessToken,
          mediaId,
          tenantId,
          supabase,
          mimeType,
          type
        );
      } catch (e) {
        console.error("[whatsapp-cloud-webhook] media download failed", e);
      }
    }

    const tipoMap: Record<string, string> = {
      image: "imagem",
      audio: "audio",
      video: "video",
      document: "documento",
      sticker: "imagem",
    };
    const tipo = tipoMap[type] || "texto";
    const conteudo = publicUrl || caption || `[${type}]`;
    const preview = caption || `[${tipo}]`;

    return {
      conteudo,
      tipo,
      previewText: preview,
      mediaInfo: { caption, mimeType, mediaId, mediaUrl: publicUrl },
    };
  }

  // Unsupported types (location, contacts, reaction, etc)
  return {
    conteudo: `[${type} não suportado]`,
    tipo: "texto",
    previewText: `[${type}]`,
    mediaInfo: { raw: msg[type] || {} },
  };
}

async function downloadAndStoreMedia(
  accessToken: string,
  mediaId: string,
  tenantId: string,
  supabase: any,
  mimeType: string,
  type: string
): Promise<string> {
  // 1. Get media URL from Graph API
  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaRes.ok) throw new Error(`Graph media meta failed: ${metaRes.status}`);
  const metaJson = await metaRes.json();
  const mediaUrl = metaJson.url;
  if (!mediaUrl) throw new Error("No url in media meta");

  // 2. Download binary
  const binRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!binRes.ok) throw new Error(`Media download failed: ${binRes.status}`);
  const buffer = await binRes.arrayBuffer();

  // 3. Upload to chat-media bucket
  const ext = (mimeType.split("/")[1] || "bin").split(";")[0];
  const path = `${tenantId}/whatsapp_cloud/${Date.now()}_${mediaId}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("chat-media")
    .upload(path, new Uint8Array(buffer), {
      contentType: mimeType || "application/octet-stream",
      upsert: false,
    });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
  return pub.publicUrl;
}

async function processStatusUpdate(supabase: any, tenantId: string, status: any) {
  const waMessageId = status.id;
  const newStatus = status.status; // sent | delivered | read | failed
  if (!waMessageId || !newStatus) return;

  // Find message by wa_message_id and merge status into metadata
  const { data: msg } = await supabase
    .from("mensagens")
    .select("id, metadata")
    .eq("tenant_id", tenantId)
    .eq("metadata->>wa_message_id", waMessageId)
    .maybeSingle();

  if (!msg) return;

  const newMeta = {
    ...(msg.metadata || {}),
    wa_status: newStatus,
    wa_status_at: new Date().toISOString(),
    ...(status.errors ? { wa_errors: status.errors } : {}),
  };

  await supabase.from("mensagens").update({ metadata: newMeta }).eq("id", msg.id);
}

async function findOrCreateContact(
  supabase: any,
  tenantId: string,
  phone: string,
  name: string
) {
  const { data: existing } = await supabase
    .from("contatos")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("telefone", phone)
    .maybeSingle();
  if (existing) return existing;

  const { data: inserted, error } = await supabase
    .from("contatos")
    .insert({ tenant_id: tenantId, nome: name, telefone: phone })
    .select("id")
    .maybeSingle();
  if (inserted) return inserted;

  if (error && (error.code === "23505" || /duplicate|unique/i.test(error.message || ""))) {
    const { data: retry } = await supabase
      .from("contatos")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("telefone", phone)
      .maybeSingle();
    if (retry) return retry;
  }

  console.error("findOrCreateContact failed:", error);
  return null;
}

async function findOrCreateConversa(
  supabase: any,
  tenantId: string,
  contatoId: string,
  phoneNumberId: string
): Promise<{ conversa: any; created: boolean } | null> {
  const { data: existing } = await supabase
    .from("conversas")
    .select("id, status, canal")
    .eq("tenant_id", tenantId)
    .eq("contato_id", contatoId)
    .eq("canal", "whatsapp_cloud")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (existing.status !== "aberta") {
      await supabase
        .from("conversas")
        .update({ status: "aberta", nao_lidas: 0 })
        .eq("id", existing.id);
    }
    return { conversa: existing, created: false };
  }

  const { data: defaultDepto } = await supabase
    .from("departamentos")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("ativo", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  let atendenteId: string | null = null;
  let departamentoId: string | null = null;

  if (defaultDepto) {
    departamentoId = defaultDepto.id;
    const { data: nextAgent } = await supabase.rpc("distribuir_atendente", {
      p_tenant_id: tenantId,
      p_departamento_id: departamentoId,
    });
    if (nextAgent) atendenteId = nextAgent;
  }

  const { data: newConversa, error: convErr } = await supabase
    .from("conversas")
    .insert({
      tenant_id: tenantId,
      contato_id: contatoId,
      status: "aberta",
      canal: "whatsapp_cloud",
      whatsapp_cloud_phone_id: phoneNumberId,
      departamento_id: departamentoId,
      atendente_id: atendenteId,
    })
    .select("id, status, canal")
    .maybeSingle();

  if (convErr) {
    console.error("[whatsapp-cloud-webhook] insert conversa FAILED", {
      code: convErr.code,
      message: convErr.message,
      details: convErr.details,
      hint: convErr.hint,
      tenantId,
      contatoId,
      phoneNumberId,
    });
    const { data: fallback } = await supabase
      .from("conversas")
      .select("id, status, canal")
      .eq("tenant_id", tenantId)
      .eq("contato_id", contatoId)
      .neq("status", "encerrada")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback) {
      console.log("[whatsapp-cloud-webhook] using fallback conversa", fallback.id);
      return { conversa: fallback, created: false };
    }
    return null;
  }

  if (newConversa && atendenteId) {
    const { data: agentProfile } = await supabase
      .from("profiles")
      .select("nome")
      .eq("id", atendenteId)
      .single();
    const { data: deptoData } = await supabase
      .from("departamentos")
      .select("nome")
      .eq("id", departamentoId!)
      .single();

    const agentName = agentProfile?.nome || "Atendente";
    const deptoName = deptoData?.nome || "Departamento";

    await supabase.from("mensagens").insert({
      conversa_id: newConversa.id,
      tenant_id: tenantId,
      conteudo: `Conversa atribuída a ${agentName} (${deptoName})`,
      remetente: "sistema",
      tipo: "texto",
    });
  }

  return newConversa ? { conversa: newConversa, created: true } : null;
}
