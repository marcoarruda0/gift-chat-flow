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

    const instanceId = payload.instanceId;
    if (!instanceId) {
      return new Response(JSON.stringify({ error: "No instanceId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: zapiConfig } = await supabase
      .from("zapi_config")
      .select("tenant_id, instance_id, token, client_token")
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
    const { messageType, messageContent, messageText } = parseMessageContent(payload);

    // Handle incoming or outgoing message
    if (payload.phone && messageContent) {
      const isFromMe = payload.fromMe === true;
      const rawPhone = payload.phone || "";
      const isGroup = payload.isGroup === true || rawPhone.includes("@g.us");
      const phone = isGroup ? rawPhone : rawPhone.replace(/\D/g, "");
      const groupName = payload.chatName || "Grupo";
      const senderName = payload.senderName || payload.chatName || phone;
      const contactName = isGroup ? groupName : senderName;
      const zapiMessageId = payload.messageId || payload.id?.id || null;

      // Deduplication: check if message already exists by messageId
      if (zapiMessageId) {
        const { data: existing } = await supabase
          .from("mensagens")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("metadata->>messageId", zapiMessageId)
          .limit(1);

        if (existing && existing.length > 0) {
          console.log("Duplicate message, skipping:", zapiMessageId);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Find or create contact
      const contato = await findOrCreateContact(supabase, tenantId, phone, contactName);
      if (!contato) {
        console.error("Could not find/create contact");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find or create conversation
      const conversa = await findOrCreateConversa(supabase, tenantId, contato.id);
      if (!conversa) {
        console.error("Could not find/create conversation");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Determine remetente based on fromMe
      const remetente = isFromMe ? "atendente" : "contato";

      // Insert message
      await supabase.from("mensagens").insert({
        conversa_id: conversa.id,
        tenant_id: tenantId,
        conteudo: messageContent,
        remetente,
        tipo: messageType,
        metadata: {
          senderName: payload.senderName || payload.chatName || null,
          senderAvatar: payload.senderPhoto || payload.photo || null,
          messageId: zapiMessageId,
        },
      });

      // Update conversation
      const previewText = isGroup ? `${senderName}: ${messageText}`.slice(0, 100) : messageText;

      if (isFromMe) {
        await supabase
          .from("conversas")
          .update({
            ultimo_texto: previewText,
            ultima_msg_at: new Date().toISOString(),
          })
          .eq("id", conversa.id);
      } else {
        const currentUnread = await supabase
          .from("conversas")
          .select("nao_lidas")
          .eq("id", conversa.id)
          .single()
          .then(r => r.data?.nao_lidas || 0);

        await supabase
          .from("conversas")
          .update({
            ultimo_texto: previewText,
            ultima_msg_at: new Date().toISOString(),
            nao_lidas: currentUnread + 1,
          })
          .eq("id", conversa.id);
      }

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

      console.log(`Message saved (${remetente}) for conversa:`, conversa.id);

      // ✨ FLOW ENGINE — only for incoming text messages (not fromMe, not group)
      if (!isFromMe && !isGroup && messageType === "texto" && messageContent) {
        const fluxoHandled = await handleFluxoEngine(
          supabase, tenantId, phone, messageContent, conversa.id, contato.id, zapiConfig
        );

        // AI Auto-Responder — only if flow engine didn't handle it
        if (!fluxoHandled) {
          await handleAIAutoResponder(supabase, tenantId, phone, messageContent, conversa.id);
        }
      }
    }

    // Handle message status updates
    if (payload.status) {
      console.log("Status update:", payload.status);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// =====================================================
// FLOW ENGINE
// =====================================================

interface FlowNode {
  id: string;
  type: string;
  data: {
    nodeType: string;
    label: string;
    config?: Record<string, any>;
  };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

async function handleFluxoEngine(
  supabase: any,
  tenantId: string,
  phone: string,
  messageText: string,
  conversaId: string,
  contatoId: string,
  zapiConfig: any
): Promise<boolean> {
  try {
    // 1. Check for active session (conversation in the middle of a flow)
    const { data: sessao } = await supabase
      .from("fluxo_sessoes")
      .select("*, fluxos(nodes_json, edges_json)")
      .eq("conversa_id", conversaId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (sessao && sessao.aguardando_resposta) {
      console.log("Flow session active, processing response for node:", sessao.node_atual);
      const nodes: FlowNode[] = sessao.fluxos?.nodes_json || [];
      const edges: FlowEdge[] = sessao.fluxos?.edges_json || [];
      const currentNode = nodes.find(n => n.id === sessao.node_atual);

      if (currentNode?.data?.nodeType === "menu") {
        // Process menu response
        const opcoes: string[] = currentNode.data.config?.opcoes || [];
        const respNum = parseInt(messageText.trim(), 10);
        let nextNodeId: string | null = null;

        if (!isNaN(respNum) && respNum >= 1 && respNum <= opcoes.length) {
          const handleId = `opcao_${respNum - 1}`;
          const edge = edges.find(e => e.source === currentNode.id && e.sourceHandle === handleId);
          nextNodeId = edge?.target || null;
          console.log(`Menu response ${respNum} → handle ${handleId} → node ${nextNodeId}`);
        } else {
          // Fallback
          const edge = edges.find(e => e.source === currentNode.id && e.sourceHandle === "fallback");
          nextNodeId = edge?.target || null;
          console.log(`Menu fallback → node ${nextNodeId}`);

          // Send fallback message if configured
          const fallbackTexto = currentNode.data.config?.fallback_texto;
          if (fallbackTexto) {
            await sendZapiText(zapiConfig, phone, fallbackTexto);
            await saveBotMessage(supabase, conversaId, tenantId, fallbackTexto);
          }
        }

        if (nextNodeId) {
          // Update session and continue execution
          await supabase
            .from("fluxo_sessoes")
            .update({ node_atual: nextNodeId, aguardando_resposta: false, updated_at: new Date().toISOString() })
            .eq("id", sessao.id);

          const contato = await getContato(supabase, contatoId);
          await executeFlowFrom(supabase, tenantId, phone, conversaId, contatoId, contato, zapiConfig, nodes, edges, nextNodeId, sessao.id, sessao.fluxo_id);
        } else {
          // No next node, end session
          await supabase.from("fluxo_sessoes").delete().eq("id", sessao.id);
          console.log("Flow session ended (no next node after menu)");
        }
        return true;
      }

      // Non-menu waiting state — shouldn't happen, clean up
      await supabase.from("fluxo_sessoes").delete().eq("id", sessao.id);
    }

    // 2. Check for trigger match in active flows
    const { data: fluxos } = await supabase
      .from("fluxos")
      .select("id, nodes_json, edges_json")
      .eq("tenant_id", tenantId)
      .eq("status", "ativo");

    if (!fluxos || fluxos.length === 0) return false;

    for (const fluxo of fluxos) {
      const nodes: FlowNode[] = fluxo.nodes_json || [];
      const edges: FlowEdge[] = fluxo.edges_json || [];

      // Find gatilho node matching the message
      const gatilho = nodes.find(n =>
        n.data?.nodeType === "gatilho" &&
        n.data?.config?.texto &&
        n.data.config.texto.trim().toLowerCase() === messageText.trim().toLowerCase()
      );

      if (gatilho) {
        console.log(`Flow triggered! Fluxo=${fluxo.id}, gatilho="${gatilho.data.config?.texto}"`);

        // Find next node after gatilho
        const edge = edges.find(e => e.source === gatilho.id);
        if (!edge) {
          console.log("Gatilho has no outgoing edge");
          return true;
        }

        // Create session
        const { data: newSessao } = await supabase
          .from("fluxo_sessoes")
          .upsert({
            conversa_id: conversaId,
            fluxo_id: fluxo.id,
            tenant_id: tenantId,
            node_atual: edge.target,
            aguardando_resposta: false,
            dados: {},
            updated_at: new Date().toISOString(),
          }, { onConflict: "conversa_id" })
          .select("id")
          .single();

        const contato = await getContato(supabase, contatoId);
        await executeFlowFrom(supabase, tenantId, phone, conversaId, contatoId, contato, zapiConfig, nodes, edges, edge.target, newSessao?.id, fluxo.id);
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error("Flow engine error:", err);
    return false;
  }
}

async function executeFlowFrom(
  supabase: any,
  tenantId: string,
  phone: string,
  conversaId: string,
  contatoId: string,
  contato: any,
  zapiConfig: any,
  nodes: FlowNode[],
  edges: FlowEdge[],
  startNodeId: string,
  sessaoId: string | null,
  fluxoId: string
) {
  let currentNodeId: string | null = startNodeId;
  let steps = 0;
  const MAX_STEPS = 50;

  while (currentNodeId && steps < MAX_STEPS) {
    steps++;
    const node = nodes.find(n => n.id === currentNodeId);
    if (!node) {
      console.log(`Node ${currentNodeId} not found, ending flow`);
      break;
    }

    const nodeType = node.data?.nodeType;
    const config = node.data?.config || {};
    console.log(`Executing node ${node.id} (${nodeType}), step ${steps}`);

    // Execute based on node type
    switch (nodeType) {
      case "gatilho":
        // Just move to next
        break;

      case "conteudo": {
        const corpo = replaceVariables(config.corpo || "", contato);
        if (corpo) {
          await sendZapiText(zapiConfig, phone, corpo);
          await saveBotMessage(supabase, conversaId, tenantId, corpo);
        }
        break;
      }

      case "menu": {
        const pergunta = config.pergunta || "";
        const opcoes: string[] = config.opcoes || [];
        const tipoMenu = config.tipo_menu || "lista";

        if (tipoMenu === "botoes" && opcoes.length > 0 && opcoes.length <= 3) {
          // Send as interactive WhatsApp buttons
          const buttonMessage = replaceVariables(pergunta, contato);
          await sendZapiButtons(zapiConfig, phone, buttonMessage, opcoes);
          await saveBotMessage(supabase, conversaId, tenantId, buttonMessage + "\n\n" + opcoes.map((op: string, i: number) => `[${op}]`).join(" "));
        } else {
          // Send as numbered list (default)
          let menuText = replaceVariables(pergunta, contato);
          if (opcoes.length > 0) {
            menuText += "\n\n" + opcoes.map((op: string, i: number) => `${i + 1}. ${op}`).join("\n");
          }
          await sendZapiText(zapiConfig, phone, menuText);
          await saveBotMessage(supabase, conversaId, tenantId, menuText);
        }

        // Pause — wait for user response
        if (sessaoId) {
          await supabase
            .from("fluxo_sessoes")
            .update({ node_atual: node.id, aguardando_resposta: true, updated_at: new Date().toISOString() })
            .eq("id", sessaoId);
        }
        console.log(`Menu (${tipoMenu}) sent, waiting for response`);
        return; // STOP execution, wait for next message
      }

      case "condicional": {
        const campo = config.campo || "";
        const operador = config.operador || "==";
        const valor = config.valor || "";
        const contatoValue = getContatoField(contato, campo);
        const match = evaluateCondition(contatoValue, operador, valor);
        const handleId = match ? "sim" : "nao";
        const edge = edges.find(e => e.source === node.id && e.sourceHandle === handleId);
        currentNodeId = edge?.target || null;
        console.log(`Condicional: ${campo} ${operador} ${valor} → ${match} → ${currentNodeId}`);
        continue; // Skip the default next-node logic below
      }

      case "transferir": {
        const tipoTransf = config.tipo_transferencia || "departamento";
        const deptoId = config.departamento_id || null;
        const membroId = config.membro_id || null;
        const mensagem = config.mensagem || "";

        const updateData: any = {};
        if (tipoTransf === "departamento" && deptoId) {
          updateData.departamento_id = deptoId;
          // Round-robin assignment
          const { data: nextAgent } = await supabase.rpc("distribuir_atendente", {
            p_tenant_id: tenantId,
            p_departamento_id: deptoId,
          });
          if (nextAgent) updateData.atendente_id = nextAgent;
        } else if (tipoTransf === "membro" && membroId) {
          updateData.atendente_id = membroId;
        }

        if (Object.keys(updateData).length > 0) {
          await supabase.from("conversas").update(updateData).eq("id", conversaId);

          // System message
          let sysMsg = "Conversa transferida";
          if (updateData.atendente_id) {
            const { data: agentProfile } = await supabase
              .from("profiles")
              .select("nome")
              .eq("id", updateData.atendente_id)
              .single();
            sysMsg = `Conversa transferida para ${agentProfile?.nome || "atendente"}`;
          }
          await supabase.from("mensagens").insert({
            conversa_id: conversaId,
            tenant_id: tenantId,
            conteudo: sysMsg,
            remetente: "sistema",
            tipo: "texto",
          });
        }

        if (mensagem) {
          const msg = replaceVariables(mensagem, contato);
          await sendZapiText(zapiConfig, phone, msg);
          await saveBotMessage(supabase, conversaId, tenantId, msg);
        }
        break;
      }

      case "tag": {
        const tag = config.tag || "";
        const acao = config.acao || "Adicionar";
        if (tag && contato) {
          const currentTags: string[] = contato.tags || [];
          let newTags: string[];
          if (acao === "Remover") {
            newTags = currentTags.filter((t: string) => t !== tag);
          } else {
            newTags = currentTags.includes(tag) ? currentTags : [...currentTags, tag];
          }
          await supabase.from("contatos").update({ tags: newTags }).eq("id", contatoId);
          contato.tags = newTags;
          console.log(`Tag ${acao}: ${tag}`);
        }
        break;
      }

      case "assistente_ia": {
        const prompt = config.prompt || "";
        if (prompt) {
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (LOVABLE_API_KEY) {
            try {
              const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-2.5-flash",
                  messages: [
                    { role: "system", content: replaceVariables(prompt, contato) },
                    { role: "user", content: "Responda de forma direta e concisa." },
                  ],
                }),
              });
              if (aiResponse.ok) {
                const aiData = await aiResponse.json();
                const resposta = aiData.choices?.[0]?.message?.content || "";
                if (resposta) {
                  await sendZapiText(zapiConfig, phone, resposta);
                  await saveBotMessage(supabase, conversaId, tenantId, resposta);
                }
              }
            } catch (aiErr) {
              console.error("AI node error:", aiErr);
            }
          }
        }
        break;
      }

      case "webhook": {
        const url = config.url || "";
        if (url) {
          try {
            await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tenant_id: tenantId,
                conversa_id: conversaId,
                contato_id: contatoId,
                phone,
                contato_nome: contato?.nome,
              }),
            });
            console.log("Webhook called:", url);
          } catch (whErr) {
            console.error("Webhook node error:", whErr);
          }
        }
        break;
      }

      case "atraso":
        // v1: no delay, continue immediately
        console.log("Atraso node (skipping delay in v1)");
        break;

      case "consultar_saldo": {
        // Refresh contato data for saldo
        const { data: freshContato } = await supabase
          .from("contatos")
          .select("saldo_giftback")
          .eq("id", contatoId)
          .single();
        if (freshContato) contato.saldo_giftback = freshContato.saldo_giftback;
        break;
      }

      default:
        console.log(`Unknown node type: ${nodeType}, skipping`);
        break;
    }

    // Find next node (default source handle)
    const nextEdge = edges.find(e => e.source === node.id && (!e.sourceHandle || e.sourceHandle === null));
    currentNodeId = nextEdge?.target || null;
  }

  // Flow ended — clean up session
  if (sessaoId) {
    await supabase.from("fluxo_sessoes").delete().eq("id", sessaoId);
    console.log("Flow session ended after", steps, "steps");
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function replaceVariables(text: string, contato: any): string {
  if (!text || !contato) return text;
  return text
    .replace(/\{nome\}/gi, contato.nome || "")
    .replace(/\{telefone\}/gi, contato.telefone || "")
    .replace(/\{saldo_giftback\}/gi, String(contato.saldo_giftback || 0));
}

function getContatoField(contato: any, campo: string): string {
  if (!contato || !campo) return "";
  const val = contato[campo];
  if (val === null || val === undefined) return "";
  if (Array.isArray(val)) return val.join(",");
  return String(val);
}

function evaluateCondition(value: string, operador: string, expected: string): boolean {
  const v = value.toLowerCase().trim();
  const e = expected.toLowerCase().trim();
  switch (operador) {
    case "==": case "igual": return v === e;
    case "!=": case "diferente": return v !== e;
    case "contem": case "contém": return v.includes(e);
    case "nao_contem": return !v.includes(e);
    case ">": return parseFloat(v) > parseFloat(e);
    case "<": return parseFloat(v) < parseFloat(e);
    case ">=": return parseFloat(v) >= parseFloat(e);
    case "<=": return parseFloat(v) <= parseFloat(e);
    case "vazio": return v === "";
    case "nao_vazio": return v !== "";
    default: return v === e;
  }
}

async function getContato(supabase: any, contatoId: string) {
  const { data } = await supabase
    .from("contatos")
    .select("*")
    .eq("id", contatoId)
    .single();
  return data;
}

async function sendZapiText(zapiConfig: any, phone: string, message: string) {
  const sendUrl = `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`;
  try {
    const resp = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": zapiConfig.client_token,
      },
      body: JSON.stringify({ phone, message }),
    });
    console.log("Z-API send-text:", resp.status);
  } catch (err) {
    console.error("Z-API send error:", err);
  }
}

async function saveBotMessage(supabase: any, conversaId: string, tenantId: string, content: string) {
  await supabase.from("mensagens").insert({
    conversa_id: conversaId,
    tenant_id: tenantId,
    conteudo: content,
    remetente: "bot",
    tipo: "texto",
  });
  await supabase
    .from("conversas")
    .update({ ultimo_texto: content, ultima_msg_at: new Date().toISOString() })
    .eq("id", conversaId);
}

function parseMessageContent(payload: any) {
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

  return { messageType, messageContent, messageText };
}

async function findOrCreateContact(supabase: any, tenantId: string, phone: string, name: string) {
  let { data: contato } = await supabase
    .from("contatos")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("telefone", phone)
    .single();

  if (!contato) {
    const { data: newContato } = await supabase
      .from("contatos")
      .insert({ tenant_id: tenantId, nome: name, telefone: phone })
      .select("id")
      .single();
    contato = newContato;
  }

  return contato;
}

async function findOrCreateConversa(supabase: any, tenantId: string, contatoId: string) {
  // Search for ANY conversation for this contact (not just open ones)
  let { data: conversa } = await supabase
    .from("conversas")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("contato_id", contatoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // If found a closed conversation, reopen it
  if (conversa && conversa.status !== "aberta") {
    await supabase
      .from("conversas")
      .update({ status: "aberta", nao_lidas: 0 })
      .eq("id", conversa.id);
    console.log("Reopened existing conversation:", conversa.id);
    return conversa;
  }

  if (conversa) {
    return conversa;
  }

  if (!conversa) {
    const { data: defaultDepto } = await supabase
      .from("departamentos")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("created_at")
      .limit(1)
      .single();

    let atendenteId: string | null = null;
    let departamentoId: string | null = null;

    if (defaultDepto) {
      departamentoId = defaultDepto.id;
      const { data: nextAgent } = await supabase.rpc("distribuir_atendente", {
        p_tenant_id: tenantId,
        p_departamento_id: departamentoId,
      });
      if (nextAgent) {
        atendenteId = nextAgent;
      }
    }

    const { data: newConversa } = await supabase
      .from("conversas")
      .insert({
        tenant_id: tenantId,
        contato_id: contatoId,
        status: "aberta",
        departamento_id: departamentoId,
        atendente_id: atendenteId,
      })
      .select("id")
      .single();
    conversa = newConversa;

    if (conversa && atendenteId) {
      const { data: agentProfile } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", atendenteId)
        .single();

      const { data: deptoData } = await supabase
        .from("departamentos")
        .select("nome")
        .eq("id", departamentoId)
        .single();

      const agentName = agentProfile?.nome || "Atendente";
      const deptoName = deptoData?.nome || "Departamento";

      await supabase.from("mensagens").insert({
        conversa_id: conversa.id,
        tenant_id: tenantId,
        conteudo: `Conversa atribuída a ${agentName} (${deptoName})`,
        remetente: "sistema",
        tipo: "texto",
      });
    }
  }

  return conversa;
}

async function handleAIAutoResponder(supabase: any, tenantId: string, phone: string, messageContent: string, conversaId: string) {
  try {
    const { data: iaConfig } = await supabase
      .from("ia_config")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (iaConfig && !iaConfig.ativo) {
      console.log("AI auto-responder disabled for tenant:", tenantId);
      return;
    }

    const { data: artigos } = await supabase
      .from("conhecimento_base")
      .select("titulo, conteudo, categoria")
      .eq("tenant_id", tenantId)
      .eq("ativo", true);

    if (!artigos || artigos.length === 0) return;

    const contexto = artigos
      .map((a: any, i: number) => `[${i + 1}] ${a.titulo} (${a.categoria})\n${a.conteudo}`)
      .join("\n\n---\n\n");

    const nome = iaConfig?.nome_assistente || "Assistente Virtual";
    const tom = iaConfig?.tom || "amigavel";
    const emojis = iaConfig?.usar_emojis || "pouco";
    const extras = iaConfig?.instrucoes_extras || "";

    const tomMap: Record<string, string> = {
      formal: "Responda de forma profissional, formal e objetiva.",
      amigavel: "Responda de forma cordial, simpática e próxima.",
      casual: "Responda de forma descontraída, leve e informal.",
    };

    const emojiMap: Record<string, string> = {
      nao: "NÃO use emojis.",
      pouco: "Use emojis com moderação (1-2 por mensagem).",
      sim: "Use emojis de forma abundante.",
    };

    const systemPrompt = `Você é ${nome}, assistente virtual via WhatsApp.\n\n${tomMap[tom] || tomMap.amigavel}\n${emojiMap[emojis] || emojiMap.pouco}\n\nUse APENAS as informações da base de conhecimento. Se não puder responder, diga "SEM_INFO".\n${extras ? `\nINSTRUÇÕES ADICIONAIS:\n${extras}` : ""}\n\nBASE DE CONHECIMENTO:\n${contexto}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
    });

    if (!aiResponse.ok) {
      console.error("AI gateway error:", aiResponse.status);
      return;
    }

    const aiData = await aiResponse.json();
    const resposta = aiData.choices?.[0]?.message?.content || "";

    const { data: zapiCfg } = await supabase
      .from("zapi_config")
      .select("instance_id, token, client_token")
      .eq("tenant_id", tenantId)
      .single();

    if (!zapiCfg) return;

    if (resposta && !resposta.includes("SEM_INFO")) {
      await sendZapiText(zapiCfg, phone, resposta);
      await saveBotMessage(supabase, conversaId, tenantId, resposta);
      console.log("AI auto-reply saved for conversa:", conversaId);
    } else {
      console.log("AI had no relevant answer, transferring to human");
      const transferMsg = "Não consegui encontrar essa informação. Vou transferir para um atendente 🙏";
      await sendZapiText(zapiCfg, phone, transferMsg);
      await saveBotMessage(supabase, conversaId, tenantId, transferMsg);

      await supabase
        .from("conversas")
        .update({ aguardando_humano: true })
        .eq("id", conversaId);
    }
  } catch (aiErr) {
    console.error("AI auto-responder error:", aiErr);
  }
}
