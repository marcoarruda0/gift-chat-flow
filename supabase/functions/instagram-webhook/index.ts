import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";

async function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string): Promise<boolean> {
  if (!signature || !signature.startsWith("sha256=")) return false;
  const expected = signature.slice("sha256=".length);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const macHex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, "0")).join("");
  return macHex === expected;
}

async function downloadIgMedia(url: string, tenantId: string, supabase: any): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext = (blob.type.split("/")[1] || "bin").split(";")[0];
    const path = `${tenantId}/instagram/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("chat-media").upload(path, blob, {
      contentType: blob.type,
      upsert: false,
    });
    if (error) return null;
    const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // GET - handshake
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    console.log("[instagram-webhook] GET verify", { mode, hasToken: !!token });

    if (mode !== "subscribe" || !token) return new Response("Bad Request", { status: 400 });

    const { data: match } = await supabase
      .from("instagram_config")
      .select("id")
      .eq("verify_token", token)
      .maybeSingle();

    if (match) {
      await supabase
        .from("instagram_config")
        .update({ ultima_verificacao_at: new Date().toISOString() })
        .eq("id", match.id);
      return new Response(challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const appSecret = Deno.env.get("META_APP_SECRET");

  if (appSecret) {
    const ok = await verifyMetaSignature(rawBody, signature, appSecret);
    if (!ok) {
      console.warn("[instagram-webhook] invalid signature");
      return new Response("Forbidden", { status: 403 });
    }
  }

  let body: any = {};
  try { body = JSON.parse(rawBody); } catch { return new Response("Bad JSON", { status: 400 }); }

  console.log("[instagram-webhook] event", JSON.stringify(body).slice(0, 1000));

  // Instagram messaging events arrive on object="instagram" with entry[].messaging[]
  if (body.object !== "instagram") {
    return new Response("ignored", { status: 200 });
  }

  for (const entry of body.entry || []) {
    const igUserId = String(entry.id);

    // Find tenant by ig_user_id
    const { data: cfg } = await supabase
      .from("instagram_config")
      .select("id, tenant_id, ig_user_id, page_access_token")
      .eq("ig_user_id", igUserId)
      .maybeSingle();

    if (!cfg) {
      console.warn("[instagram-webhook] no tenant for ig_user_id", igUserId);
      continue;
    }

    for (const ev of entry.messaging || []) {
      try {
        const senderId = ev.sender?.id;
        const recipientId = ev.recipient?.id;
        if (!senderId) continue;

        // Skip echoes (messages sent by us)
        if (ev.message?.is_echo) continue;
        // Skip when sender == our IG account
        if (senderId === cfg.ig_user_id) continue;

        // Resolve / create contato
        let { data: contato } = await supabase
          .from("contatos")
          .select("id")
          .eq("tenant_id", cfg.tenant_id)
          .eq("instagram_id", senderId)
          .maybeSingle();

        if (!contato) {
          // Fetch IG profile
          let username = "Instagram User";
          let avatar: string | null = null;
          try {
            const profRes = await fetch(
              `https://graph.facebook.com/${GRAPH_VERSION}/${senderId}?fields=name,username,profile_pic&access_token=${cfg.page_access_token}`
            );
            if (profRes.ok) {
              const prof = await profRes.json();
              username = prof.username || prof.name || username;
              avatar = prof.profile_pic || null;
            }
          } catch {}

          const { data: novo, error: errNovo } = await supabase
            .from("contatos")
            .insert({
              tenant_id: cfg.tenant_id,
              nome: username,
              instagram_id: senderId,
              instagram_username: username,
              avatar_url: avatar,
            })
            .select("id")
            .single();
          if (errNovo) { console.error("contato insert", errNovo); continue; }
          contato = novo;
        }

        // Resolve / create conversa
        let { data: conv } = await supabase
          .from("conversas")
          .select("id, nao_lidas")
          .eq("tenant_id", cfg.tenant_id)
          .eq("contato_id", contato.id)
          .eq("canal", "instagram")
          .neq("status", "encerrada")
          .maybeSingle();

        if (!conv) {
          const { data: novaConv, error: errConv } = await supabase
            .from("conversas")
            .insert({
              tenant_id: cfg.tenant_id,
              contato_id: contato.id,
              canal: "instagram",
              status: "aberta",
              instagram_thread_id: ev.thread_id || null,
            })
            .select("id, nao_lidas")
            .single();
          if (errConv) { console.error("conversa insert", errConv); continue; }
          conv = novaConv;
        }

        // Build message
        const msg = ev.message || {};
        const wamid = msg.mid || `ig_${ev.timestamp || Date.now()}`;

        let tipo: "texto" | "imagem" | "video" | "audio" | "documento" = "texto";
        let conteudo = msg.text || "";
        const metadata: any = { wa_message_id: wamid, ig_event: ev };

        if (msg.attachments?.length) {
          const att = msg.attachments[0];
          const url = att.payload?.url;
          const mediaUrl = url ? await downloadIgMedia(url, cfg.tenant_id, supabase) : null;
          conteudo = mediaUrl || url || "";
          if (att.type === "image") tipo = "imagem";
          else if (att.type === "video") tipo = "video";
          else if (att.type === "audio") tipo = "audio";
          else tipo = "documento";
        } else if (msg.reaction) {
          conteudo = `Reagiu: ${msg.reaction.emoji || ""}`;
          metadata.reaction = msg.reaction;
        } else if (ev.postback) {
          conteudo = ev.postback.title || ev.postback.payload || "[postback]";
          metadata.postback = ev.postback;
        }

        if (!conteudo) conteudo = "[mensagem vazia]";

        // Dedup
        const { data: existente } = await supabase
          .from("mensagens")
          .select("id")
          .eq("tenant_id", cfg.tenant_id)
          .filter("metadata->>wa_message_id", "eq", wamid)
          .maybeSingle();
        if (existente) continue;

        await supabase.from("mensagens").insert({
          tenant_id: cfg.tenant_id,
          conversa_id: conv.id,
          remetente: "cliente",
          tipo,
          conteudo,
          metadata,
        });

        await supabase
          .from("conversas")
          .update({
            ultima_msg_at: new Date().toISOString(),
            ultimo_texto: conteudo.slice(0, 200),
            nao_lidas: (conv.nao_lidas || 0) + 1,
          })
          .eq("id", conv.id);

        await supabase
          .from("instagram_config")
          .update({ ultima_mensagem_at: new Date().toISOString(), status: "conectado" })
          .eq("id", cfg.id);
      } catch (err) {
        console.error("[instagram-webhook] event error", err);
      }
    }
  }

  return new Response("ok", { status: 200 });
});
