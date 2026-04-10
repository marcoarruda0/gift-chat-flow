import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload).slice(0, 500));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Z-API sends instanceId in the payload
    const instanceId = payload.instanceId;
    if (!instanceId) {
      return new Response(JSON.stringify({ error: "No instanceId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find tenant by instanceId
    const { data: zapiConfig } = await supabase
      .from("zapi_config")
      .select("tenant_id")
      .eq("instance_id", instanceId)
      .single();

    if (!zapiConfig) {
      console.log("No tenant found for instanceId:", instanceId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = zapiConfig.tenant_id;

    // Detect message type and content
    let messageText: string | null = null;
    let messageType = "texto";
    let messageContent: string | null = null;

    if (payload.text?.message) {
      messageText = payload.text.message;
      messageType = "texto";
      messageContent = payload.text.message;
    } else if (payload.image) {
      messageType = "imagem";
      messageContent = payload.image.imageUrl || payload.image.thumbnailUrl || "";
      messageText = payload.image.caption || "📷 Imagem";
    } else if (payload.document) {
      messageType = "documento";
      messageContent = payload.document.documentUrl || "";
      messageText = "📎 " + (payload.document.fileName || "Documento");
    } else if (payload.audio) {
      messageType = "audio";
      messageContent = payload.audio.audioUrl || "";
      messageText = "🎤 Áudio";
    } else if (payload.video) {
      messageType = "imagem";
      messageContent = payload.video.videoUrl || "";
      messageText = "🎬 Vídeo";
    } else if (payload.sticker) {
      messageType = "imagem";
      messageContent = payload.sticker.stickerUrl || "";
      messageText = "Sticker";
    }

    // Handle incoming message (on-message-received)
    if (payload.phone && messageContent) {
      const rawPhone = payload.phone || "";
      const isGroup = payload.isGroup === true || rawPhone.includes("@g.us");
      const phone = isGroup ? rawPhone : rawPhone.replace(/\D/g, "");
      const groupName = payload.chatName || "Grupo";
      const senderName = payload.senderName || payload.chatName || phone;
      const contactName = isGroup ? groupName : senderName;

      // Find or create contact
      let { data: contato } = await supabase
        .from("contatos")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("telefone", phone)
        .single();

      if (!contato) {
        const { data: newContato } = await supabase
          .from("contatos")
          .insert({
            tenant_id: tenantId,
            nome: contactName,
            telefone: phone,
          })
          .select("id")
          .single();
        contato = newContato;
      }

      if (!contato) {
        console.error("Could not find/create contact");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find or create conversation
      let { data: conversa } = await supabase
        .from("conversas")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("contato_id", contato.id)
        .eq("status", "aberta")
        .single();

      if (!conversa) {
        const { data: newConversa } = await supabase
          .from("conversas")
          .insert({
            tenant_id: tenantId,
            contato_id: contato.id,
            status: "aberta",
          })
          .select("id")
          .single();
        conversa = newConversa;
      }

      if (!conversa) {
        console.error("Could not find/create conversation");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Insert message
      await supabase.from("mensagens").insert({
        conversa_id: conversa.id,
        tenant_id: tenantId,
        conteudo: messageContent!,
        remetente: "contato",
        tipo: messageType,
        metadata: {
          senderName: payload.senderName || payload.chatName || null,
          senderAvatar: payload.senderPhoto || payload.photo || null,
        },
      });

      // Update conversation
      const previewText = isGroup ? `${senderName}: ${messageText}`.slice(0, 100) : messageText;
      await supabase
        .from("conversas")
        .update({
          ultimo_texto: previewText,
          ultima_msg_at: new Date().toISOString(),
          nao_lidas: (await supabase
            .from("conversas")
            .select("nao_lidas")
            .eq("id", conversa.id)
            .single()
            .then(r => (r.data?.nao_lidas || 0) + 1)),
        })
        .eq("id", conversa.id);

      // Update group name if changed
      if (isGroup && payload.chatName) {
        await supabase
          .from("contatos")
          .update({ nome: payload.chatName })
          .eq("id", contato.id);
      }

      // Update avatar if available
      if (payload.photo) {
        await supabase
          .from("contatos")
          .update({ avatar_url: payload.photo })
          .eq("id", contato.id);
      }

      console.log("Message saved for conversa:", conversa.id);
    }

    // Handle message status updates (delivery, read)
    if (payload.status) {
      console.log("Status update:", payload.status);
      // Future: update message metadata with delivery/read status
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, // Always return 200 to Z-API to avoid retries
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
