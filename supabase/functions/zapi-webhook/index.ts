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

      // === AI Auto-Responder ===
      if (!isGroup && !payload.fromMe && messageType === "texto" && messageContent) {
        try {
          // 0. Check ia_config for this tenant
          const { data: iaConfig } = await supabase
            .from("ia_config")
            .select("*")
            .eq("tenant_id", tenantId)
            .maybeSingle();

          // If config exists and ativo=false, skip
          if (iaConfig && !iaConfig.ativo) {
            console.log("AI auto-responder disabled for tenant:", tenantId);
          } else {
            // 1. Fetch active knowledge base articles
            const { data: artigos } = await supabase
              .from("conhecimento_base")
              .select("titulo, conteudo, categoria")
              .eq("tenant_id", tenantId)
              .eq("ativo", true);

            if (artigos && artigos.length > 0) {
              // 2. Build context
              const contexto = artigos
                .map((a: any, i: number) => `[${i + 1}] ${a.titulo} (${a.categoria})\n${a.conteudo}`)
                .join("\n\n---\n\n");

              // 3. Build dynamic system prompt based on ia_config
              const nome = iaConfig?.nome_assistente || "Assistente Virtual";
              const tom = iaConfig?.tom || "amigavel";
              const emojis = iaConfig?.usar_emojis || "pouco";
              const extras = iaConfig?.instrucoes_extras || "";

              const tomMap: Record<string, string> = {
                formal: "Responda de forma profissional, formal e objetiva. Use linguagem corporativa e evite gírias.",
                amigavel: "Responda de forma cordial, simpática e próxima, como um atendente bem treinado e educado. Seja natural.",
                casual: "Responda de forma descontraída, leve e informal, como se estivesse conversando com um amigo.",
              };

              const emojiMap: Record<string, string> = {
                nao: "NÃO use emojis em nenhuma circunstância.",
                pouco: "Use emojis com moderação, apenas quando for natural e ajudar na comunicação (1-2 por mensagem no máximo).",
                sim: "Use emojis de forma abundante para tornar a conversa mais expressiva e acolhedora.",
              };

              const systemPrompt = `Você é ${nome}, assistente virtual de atendimento ao cliente via WhatsApp.

${tomMap[tom] || tomMap.amigavel}
${emojiMap[emojis] || emojiMap.pouco}

Use APENAS as informações da base de conhecimento abaixo para responder. Se a pergunta não puder ser respondida com as informações disponíveis, responda EXATAMENTE "SEM_INFO" e nada mais.

Não invente informações. Responda em português brasileiro.
${extras ? `\nINSTRUÇÕES ADICIONAIS:\n${extras}` : ""}

BASE DE CONHECIMENTO:
${contexto}`;

              const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
              if (LOVABLE_API_KEY) {
                const aiResponse = await fetch(
                  "https://ai.gateway.lovable.dev/v1/chat/completions",
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${LOVABLE_API_KEY}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      model: "google/gemini-2.5-flash",
                      messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: messageContent },
                      ],
                    }),
                  }
                );

                if (aiResponse.ok) {
                  const aiData = await aiResponse.json();
                  const resposta = aiData.choices?.[0]?.message?.content || "";

                  if (resposta && !resposta.includes("SEM_INFO")) {
                    const { data: zapiCfg } = await supabase
                      .from("zapi_config")
                      .select("instance_id, token, client_token")
                      .eq("tenant_id", tenantId)
                      .single();

                    if (zapiCfg) {
                      const sendUrl = `https://api.z-api.io/instances/${zapiCfg.instance_id}/token/${zapiCfg.token}/send-text`;
                      const sendResp = await fetch(sendUrl, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "Client-Token": zapiCfg.client_token,
                        },
                        body: JSON.stringify({ phone, message: resposta }),
                      });
                      console.log("AI reply sent via Z-API:", sendResp.status);

                      await supabase.from("mensagens").insert({
                        conversa_id: conversa.id,
                        tenant_id: tenantId,
                        conteudo: resposta,
                        remetente: "bot",
                        tipo: "texto",
                      });

                      await supabase
                        .from("conversas")
                        .update({ ultimo_texto: resposta, ultima_msg_at: new Date().toISOString() })
                        .eq("id", conversa.id);

                      console.log("AI auto-reply saved for conversa:", conversa.id);
                    }
                  } else {
                    // SEM_INFO — transfer to human agent
                    console.log("AI had no relevant answer, transferring to human");

                    const transferMsg = "Não consegui encontrar essa informação na nossa base. Vou transferir você para um atendente humano 🙏";

                    // Send transfer message via Z-API
                    const { data: zapiCfg2 } = await supabase
                      .from("zapi_config")
                      .select("instance_id, token, client_token")
                      .eq("tenant_id", tenantId)
                      .single();

                    if (zapiCfg2) {
                      const sendUrl2 = `https://api.z-api.io/instances/${zapiCfg2.instance_id}/token/${zapiCfg2.token}/send-text`;
                      await fetch(sendUrl2, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "Client-Token": zapiCfg2.client_token,
                        },
                        body: JSON.stringify({ phone, message: transferMsg }),
                      });

                      // Save bot message
                      await supabase.from("mensagens").insert({
                        conversa_id: conversa.id,
                        tenant_id: tenantId,
                        conteudo: transferMsg,
                        remetente: "bot",
                        tipo: "texto",
                      });

                      // Mark conversation as awaiting human + increment unread
                      const currentUnread = await supabase
                        .from("conversas")
                        .select("nao_lidas")
                        .eq("id", conversa.id)
                        .single()
                        .then(r => r.data?.nao_lidas || 0);

                      await supabase
                        .from("conversas")
                        .update({
                          aguardando_humano: true,
                          ultimo_texto: transferMsg,
                          ultima_msg_at: new Date().toISOString(),
                          nao_lidas: currentUnread + 1,
                        })
                        .eq("id", conversa.id);

                      console.log("Conversa marked as aguardando_humano:", conversa.id);
                    }
                  }
                } else {
                  console.error("AI gateway error:", aiResponse.status);
                }
              }
            }
          }
        } catch (aiErr) {
          console.error("AI auto-responder error:", aiErr);
        }
      }
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
