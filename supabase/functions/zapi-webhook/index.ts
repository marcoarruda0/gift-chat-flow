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

  let eventoId: string | null = null;
  let supabaseRef: any = null;
  let tenantIdRef: string | null = null;
  try {
    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload).slice(0, 800));

    try {
      console.log("[zapi-wh] meta", JSON.stringify({
        type: payload?.type ?? null,
        status: payload?.status ?? null,
        fromMe: payload?.fromMe ?? null,
        fromApi: payload?.fromApi ?? null,
        phone: payload?.phone ?? null,
        chatLid: payload?.chatLid ?? null,
        connectedPhone: payload?.connectedPhone ?? null,
        messageId: payload?.messageId ?? payload?.id?.id ?? null,
        isGroup: payload?.isGroup ?? null,
        topKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
      }));
    } catch (_) {}

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    supabaseRef = supabase;

    const instanceId = payload.instanceId;
    if (!instanceId) {
      return new Response(JSON.stringify({ error: "No instanceId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: zapiConfig } = await supabase
      .from("zapi_config")
      .select("tenant_id, instance_id, token, client_token, connected_phone")
      .eq("instance_id", instanceId)
      .single();

    // Auto-atualiza connected_phone do tenant a partir do payload (Z-API envia em todo evento)
    if (zapiConfig?.tenant_id && payload?.connectedPhone && zapiConfig.connected_phone !== String(payload.connectedPhone)) {
      try {
        await supabase
          .from("zapi_config")
          .update({ connected_phone: String(payload.connectedPhone) })
          .eq("tenant_id", zapiConfig.tenant_id);
        zapiConfig.connected_phone = String(payload.connectedPhone);
      } catch (_) {}
    }

    if (!zapiConfig) {
      console.log("No tenant found for instanceId:", instanceId);
      // grava mesmo assim (sem tenant) para auditoria
      await supabase.from("zapi_webhook_eventos").insert({
        instance_id: instanceId, payload, processed: false, error_msg: "no_tenant_for_instance",
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = zapiConfig.tenant_id;
    tenantIdRef = tenantId;

    // Persiste evento bruto para permitir reprocessamento posterior
    try {
      const { data: ev } = await supabase
        .from("zapi_webhook_eventos")
        .insert({ tenant_id: tenantId, instance_id: instanceId, payload, processed: false })
        .select("id")
        .maybeSingle();
      eventoId = ev?.id || null;
    } catch (logErr) {
      console.warn("[zapi-wh] failed to persist raw event:", logErr);
    }

    const result = await processIncomingPayload(supabase, zapiConfig, payload);

    if (eventoId) {
      await supabase
        .from("zapi_webhook_eventos")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          resultado: result,
          error_msg: result?.error || null,
        })
        .eq("id", eventoId);
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    if (supabaseRef && eventoId) {
      try {
        await supabaseRef.from("zapi_webhook_eventos").update({
          processed: false,
          error_msg: String((error as any)?.message || error),
        }).eq("id", eventoId);
      } catch {}
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ===========================================================================
// Helper compartilhado — extraído para permitir reprocessamento via outra fn
// ===========================================================================
async function processIncomingPayload(
  supabase: any,
  zapiConfig: any,
  payload: any,
): Promise<{ ok: boolean; action?: string; mensagemId?: string; conversaId?: string; error?: string }> {
  const tenantId = zapiConfig.tenant_id;

  const { messageType, messageContent, messageText } = parseMessageContent(payload);

  if (payload.status) {
    console.log("Status update:", payload.status);
  }

  if (!messageContent) {
    if (!payload.status) {
      console.log("[zapi-wh] ignored event (no content, no status)", {
        type: payload?.type ?? null,
        hasPhone: !!payload?.phone,
        fromMe: payload?.fromMe ?? null,
        topKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
      });
    }
    return { ok: true, action: "skipped_no_content" };
  }

  const isFromMe = payload.fromMe === true;
  const resolved = resolveRecipientPhone(payload, zapiConfig);
  const phone = resolved.normalized;
  const isGroup = resolved.isGroup;

  console.log("[zapi-wh] phone resolved", JSON.stringify({
    raw: resolved.raw,
    normalized: resolved.normalized,
    source: resolved.source,
    isGroup, isLid: resolved.isLid, fromMe: isFromMe,
  }));

  const groupName = payload.chatName || "Grupo";
  const senderName = payload.senderName || payload.chatName || phone || resolved.raw || "Contato";
  const contactName = isGroup ? groupName : senderName;
  const zapiMessageId = payload.messageId || payload.id?.id || null;

  if (!phone) {
    console.warn("[zapi-wh] phone could not be resolved — saving as pending", {
      raw: resolved.raw, source: resolved.source,
    });
    return { ok: true, action: "skipped_phone_unresolved", error: "phone_unresolved" };
  }

  // Deduplication by messageId
  if (zapiMessageId) {
    const { data: existing } = await supabase
      .from("mensagens")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("metadata->>messageId", zapiMessageId)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log("[zapi-wh] duplicate, skipping:", zapiMessageId);
      return { ok: true, action: "duplicate" };
    }
  }

  // Echo de mensagem enviada pela própria UI (sem messageId ainda)
  if (isFromMe && messageContent && zapiMessageId) {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("mensagens")
      .select("id, metadata")
      .eq("tenant_id", tenantId)
      .eq("remetente", "atendente")
      .eq("conteudo", messageContent)
      .gte("created_at", cutoff)
      .limit(5);
    const match = (recent || []).find((m: any) => !m.metadata?.messageId);
    if (match) {
      await supabase
        .from("mensagens")
        .update({ metadata: { ...(match.metadata || {}), messageId: zapiMessageId, fromMe: true, phoneRaw: resolved.raw, phoneNormalized: phone, phoneSource: resolved.source } })
        .eq("id", match.id);
      console.log("[zapi-wh] outbound echo matched UI message, attaching messageId");
      return { ok: true, action: "echo_attached", mensagemId: match.id };
    }
  }

  const contato = await findOrCreateContact(supabase, tenantId, phone, contactName);
  if (!contato) {
    console.error("[zapi-wh] could not find/create contact", { phone, contactName });
    return { ok: false, error: "contact_failed" };
  }

  const conversa = await findOrCreateConversa(supabase, tenantId, contato.id);
  if (!conversa) {
    console.error("[zapi-wh] could not find/create conversation", { contatoId: contato.id });
    return { ok: false, error: "conversa_failed" };
  }

  const remetente = isFromMe ? "atendente" : "contato";

  const { data: inserted, error: insertErr } = await supabase.from("mensagens").insert({
    conversa_id: conversa.id,
    tenant_id: tenantId,
    conteudo: messageContent,
    remetente,
    tipo: messageType,
    metadata: {
      senderName: payload.senderName || payload.chatName || null,
      senderAvatar: payload.senderPhoto || payload.photo || null,
      messageId: zapiMessageId,
      fromMe: isFromMe,
      phoneRaw: resolved.raw,
      phoneNormalized: phone,
      phoneSource: resolved.source,
      chatLid: payload.chatLid || null,
    },
  }).select("id").maybeSingle();
  if (insertErr) {
    console.error("[zapi-wh] insert mensagens failed:", insertErr);
    return { ok: false, error: "insert_failed: " + (insertErr.message || "") };
  }

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
      .then((r: any) => r.data?.nao_lidas || 0);

    await supabase
      .from("conversas")
      .update({
        ultimo_texto: previewText,
        ultima_msg_at: new Date().toISOString(),
        nao_lidas: currentUnread + 1,
      })
      .eq("id", conversa.id);
  }

  if (isGroup && payload.chatName) {
    await supabase.from("contatos").update({ nome: payload.chatName }).eq("id", contato.id);
  }
  if (payload.photo) {
    await supabase.from("contatos").update({ avatar_url: payload.photo }).eq("id", contato.id);
  }

  console.log(`Message saved (${remetente}) for conversa:`, conversa.id);

  if (!isFromMe && !isGroup && messageType === "texto" && messageContent) {
    const fluxoHandled = await handleFluxoEngine(
      supabase, tenantId, phone, messageContent, conversa.id, contato.id, zapiConfig
    );
    if (!fluxoHandled) {
      await handleAIAutoResponder(supabase, tenantId, phone, messageContent, conversa.id);
    }
  }

  return { ok: true, action: "inserted", mensagemId: inserted?.id, conversaId: conversa.id };
}

// ===========================================================================
// Telephone resolution / normalization helper
// ===========================================================================
function resolveRecipientPhone(
  p: any,
  zapiConfig?: { connected_phone?: string | null } | any,
): { raw: string; normalized: string | null; source: "phone" | "chatLid" | "connectedPhone" | "none"; isGroup: boolean; isLid: boolean } {
  const connected = (zapiConfig?.connected_phone || p?.connectedPhone || "") as string;
  let raw: string = p?.phone || "";
  let source: "phone" | "chatLid" | "connectedPhone" | "none" = raw ? "phone" : "none";

  if (!raw && p?.chatLid) {
    raw = p.chatLid;
    source = "chatLid";
  }

  const isGroup = typeof raw === "string" && raw.includes("@g.us");
  const isLid = typeof raw === "string" && raw.includes("@lid");

  if (!raw) {
    return { raw: "", normalized: null, source: "none", isGroup: false, isLid: false };
  }
  if (isGroup) {
    return { raw, normalized: raw, source, isGroup, isLid };
  }
  if (isLid) {
    // chatLid não é um telefone real; mantemos como identificador
    return { raw, normalized: null, source: "chatLid", isGroup, isLid };
  }

  let n = String(raw).replace(/\D/g, "");
  const connectedDigits = (connected || "").replace(/\D/g, "");
  // BR: connectedPhone padrão é 55 + DDD(2) + número(8/9)
  const tenantDdi = connectedDigits.slice(0, 2) || "55";
  const tenantDdd = connectedDigits.slice(2, 4);

  if (n.length === 8 || n.length === 9) {
    if (tenantDdd) n = tenantDdi + tenantDdd + n;
  } else if (n.length === 10 || n.length === 11) {
    n = tenantDdi + n;
  }
  return { raw, normalized: n || null, source, isGroup, isLid };
}

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
    // 0. Check for auto_off — block automatic responses if still active
    const { data: existingSessao } = await supabase
      .from("fluxo_sessoes")
      .select("id, dados")
      .eq("conversa_id", conversaId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (existingSessao?.dados?.auto_off_ate) {
      const autoOffAte = new Date(existingSessao.dados.auto_off_ate);
      if (autoOffAte > new Date()) {
        console.log(`Auto-off active until ${autoOffAte.toISOString()}, blocking flow`);
        return false;
      } else {
        // Auto-off expired, clean up session
        await supabase.from("fluxo_sessoes").delete().eq("id", existingSessao.id);
        console.log("Auto-off expired, cleaning up session");
      }
    }

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
        const tipoMenu = currentNode.data.config?.tipo_menu || "lista";
        const respTrimmed = messageText.trim();
        const respNum = parseInt(respTrimmed, 10);
        let nextNodeId: string | null = null;

        // Match by number (lista mode) or by button text (botoes mode)
        let matchedIndex = -1;
        if (!isNaN(respNum) && respNum >= 1 && respNum <= opcoes.length) {
          matchedIndex = respNum - 1;
        } else if (tipoMenu === "botoes") {
          // Match by exact button text (case-insensitive)
          matchedIndex = opcoes.findIndex((op: string) => op.trim().toLowerCase() === respTrimmed.toLowerCase());
        }

        if (matchedIndex >= 0) {
          const handleId = `opcao_${matchedIndex}`;
          const edge = edges.find(e => e.source === currentNode.id && e.sourceHandle === handleId);
          nextNodeId = edge?.target || null;
          console.log(`Menu response "${respTrimmed}" → index ${matchedIndex} → handle ${handleId} → node ${nextNodeId}`);
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

      // Handle triagem_ia response
      if (currentNode?.data?.nodeType === "triagem_ia") {
        const config = currentNode.data.config || {};
        const setores: { nome: string; descricao: string }[] = config.setores || [];
        const modelo = config.modelo || "google/gemini-2.5-flash";
        const maxTentativas = config.max_tentativas || 2;
        const msgFallback = config.msg_fallback || "Desculpe, não entendi. Vou te encaminhar para o atendimento.";
        const tentativasAtuais = (sessao.dados?.triagem_tentativas || 0);

        let matchedIndex = -1;
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

        if (LOVABLE_API_KEY && setores.length > 0) {
          try {
            const setoresTexto = setores.map((s, i) => `${i + 1}. ${s.nome} — ${s.descricao}`).join("\n");
            const systemPrompt = `Você é um classificador de intenções. Analise a mensagem do usuário e retorne APENAS o número do setor correspondente.\n\nSetores disponíveis:\n${setoresTexto}\n\nResposta DEVE ser APENAS o número (ex: 1, 2, 3). Se nenhum setor corresponder, responda 0.`;

            const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: modelo,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: messageText },
                ],
              }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              const resposta = (aiData.choices?.[0]?.message?.content || "").trim();
              const num = parseInt(resposta, 10);
              if (num >= 1 && num <= setores.length) {
                matchedIndex = num - 1;
              }
              console.log(`Triagem IA classified: "${resposta}" → index ${matchedIndex}`);
            }
          } catch (aiErr) {
            console.error("Triagem IA error:", aiErr);
          }
        }

        let nextNodeId: string | null = null;

        if (matchedIndex >= 0) {
          const handleId = `setor_${matchedIndex}`;
          const edge = edges.find(e => e.source === currentNode.id && e.sourceHandle === handleId);
          nextNodeId = edge?.target || null;
          console.log(`Triagem matched setor "${setores[matchedIndex].nome}" → handle ${handleId} → node ${nextNodeId}`);
        } else {
          // Check retry
          if (tentativasAtuais + 1 < maxTentativas) {
            // Retry: increment counter, ask again
            await supabase
              .from("fluxo_sessoes")
              .update({
                dados: { ...(sessao.dados || {}), triagem_tentativas: tentativasAtuais + 1 },
                updated_at: new Date().toISOString(),
              })
              .eq("id", sessao.id);
            await sendZapiText(zapiConfig, phone, "Não entendi bem. Poderia reformular sua pergunta?");
            await saveBotMessage(supabase, conversaId, tenantId, "Não entendi bem. Poderia reformular sua pergunta?");
            console.log(`Triagem retry ${tentativasAtuais + 1}/${maxTentativas}`);
            return true;
          }

          // Fallback
          const fallbackEdge = edges.find(e => e.source === currentNode.id && e.sourceHandle === "fallback");
          nextNodeId = fallbackEdge?.target || null;
          await sendZapiText(zapiConfig, phone, msgFallback);
          await saveBotMessage(supabase, conversaId, tenantId, msgFallback);
          console.log(`Triagem fallback → node ${nextNodeId}`);
        }

        if (nextNodeId) {
          await supabase
            .from("fluxo_sessoes")
            .update({ node_atual: nextNodeId, aguardando_resposta: false, dados: {}, updated_at: new Date().toISOString() })
            .eq("id", sessao.id);

          const contato = await getContato(supabase, contatoId);
          await executeFlowFrom(supabase, tenantId, phone, conversaId, contatoId, contato, zapiConfig, nodes, edges, nextNodeId, sessao.id, sessao.fluxo_id);
        } else {
          await supabase.from("fluxo_sessoes").delete().eq("id", sessao.id);
          console.log("Flow session ended (no next node after triagem)");
        }
        return true;
      }

      // Handle assistente_ia response (multi-turn AI conversation)
      if (currentNode?.data?.nodeType === "assistente_ia") {
        const config = currentNode.data.config || {};
        const modelo = config.modelo || "google/gemini-2.5-flash";
        const temperatura = config.temperatura ?? 0.7;
        const instrucoes = config.instrucoes || config.prompt || "";
        const contextoGeral = config.contexto_geral || "";
        const instrucoesIndividuais = config.instrucoes_individuais || "";
        const sucessoDescricao = config.sucesso_descricao || "";
        const interrupcaoDescricao = config.interrupcao_descricao || "";
        const msgErro = config.msg_erro || "Desculpe, ocorreu um erro. Tente novamente.";

        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) {
          console.error("LOVABLE_API_KEY not configured for assistente_ia");
          await sendZapiText(zapiConfig, phone, msgErro);
          await saveBotMessage(supabase, conversaId, tenantId, msgErro);
          await supabase.from("fluxo_sessoes").delete().eq("id", sessao.id);
          return true;
        }

        try {
          // Build history from session
          const historicoIa: { role: string; content: string }[] = sessao.dados?.historico_ia || [];

          // Fetch knowledge base articles for context
          let knowledgeContext = "";
          const { data: artigos } = await supabase
            .from("conhecimento_base")
            .select("titulo, conteudo, categoria")
            .eq("tenant_id", tenantId)
            .eq("ativo", true);

          if (artigos && artigos.length > 0) {
            knowledgeContext = "\n\nBASE DE CONHECIMENTO:\n" +
              artigos.map((a: any, i: number) => `[${i + 1}] ${a.titulo} (${a.categoria})\n${a.conteudo}`).join("\n---\n");
          }

          // Build exit conditions with smart defaults
          const finalSucessoDesc = sucessoDescricao || "A dúvida ou solicitação do usuário foi respondida/resolvida satisfatoriamente, o usuário agradeceu, se despediu, ou disse que não precisa de mais nada";
          const finalInterrupcaoDesc = interrupcaoDescricao || "O usuário pede para falar com um humano, atendente, ou muda de assunto para algo completamente fora do escopo das instruções";

          const exitInstructions = `
REGRAS DE SAÍDA (PRIORIDADE MÁXIMA — SIGA RIGOROSAMENTE):
Você DEVE avaliar CADA resposta para verificar se uma condição de saída foi atingida.

1. SUCESSO: ${finalSucessoDesc}
   → Quando isso acontecer, sua resposta DEVE começar EXATAMENTE com [SUCESSO] (sem asteriscos, sem espaços antes).
   Exemplo: [SUCESSO] De nada! Qualquer coisa é só chamar.
   Exemplo: [SUCESSO] Fico feliz em ter ajudado!

2. INTERRUPÇÃO: ${finalInterrupcaoDesc}
   → Quando isso acontecer, sua resposta DEVE começar EXATAMENTE com [INTERRUPCAO] (sem asteriscos, sem espaços antes).
   Exemplo: [INTERRUPCAO] Vou transferir você para um atendente humano.

3. Se NENHUMA condição de saída foi atingida, responda normalmente SEM nenhum prefixo entre colchetes.

IMPORTANTE: Não use markdown (**, ##) nos prefixos. O prefixo deve ser LITERAL: [SUCESSO] ou [INTERRUPCAO].`;

          // Build system prompt — exit instructions FIRST for priority
          const contato = await getContato(supabase, contatoId);
          let systemPrompt = exitInstructions + "\n\n";
          systemPrompt += replaceVariables(instrucoes, contato);
          if (contextoGeral) systemPrompt += "\n\n" + replaceVariables(contextoGeral, contato);
          if (instrucoesIndividuais) systemPrompt += "\n\n" + replaceVariables(instrucoesIndividuais, contato);
          systemPrompt += knowledgeContext;
          systemPrompt += "\n\nResponda em português brasileiro. Seja direto e útil.";

          // Build messages array
          const aiMessages: { role: string; content: string }[] = [
            { role: "system", content: systemPrompt },
            ...historicoIa,
            { role: "user", content: messageText },
          ];

          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: modelo,
              messages: aiMessages,
              temperature: temperatura,
            }),
          });

          if (!aiResponse.ok) {
            console.error("AI assistente error:", aiResponse.status);
            await sendZapiText(zapiConfig, phone, msgErro);
            await saveBotMessage(supabase, conversaId, tenantId, msgErro);
            return true;
          }

          const aiData = await aiResponse.json();
          let resposta = (aiData.choices?.[0]?.message?.content || "").trim();
          console.log(`Assistente IA raw response: "${resposta.slice(0, 100)}..."`);

          // Check for exit conditions
          let exitHandle: string | null = null;
          // Robust exit detection with regex (handles markdown, spaces, colons)
          const sucessoMatch = resposta.match(/^\s*\*{0,2}\[SUCESSO\]\*{0,2}:?\s*/i);
          const interrupcaoMatch = !sucessoMatch ? resposta.match(/^\s*\*{0,2}\[INTERRUPCAO\]\*{0,2}:?\s*/i) : null;

          if (sucessoMatch) {
            resposta = resposta.slice(sucessoMatch[0].length).trim();
            exitHandle = "sim";
            console.log("Assistente IA: SUCESSO detected via regex");
          } else if (interrupcaoMatch) {
            resposta = resposta.slice(interrupcaoMatch[0].length).trim();
            exitHandle = "interrupcao";
            console.log("Assistente IA: INTERRUPCAO detected via regex");
          } else if (resposta.includes("[SUCESSO]")) {
            // Fallback: prefix somewhere in the response
            resposta = resposta.replace(/\*{0,2}\[SUCESSO\]\*{0,2}:?\s*/i, "").trim();
            exitHandle = "sim";
            console.log("Assistente IA: SUCESSO detected via includes fallback");
          } else if (resposta.includes("[INTERRUPCAO]")) {
            resposta = resposta.replace(/\*{0,2}\[INTERRUPCAO\]\*{0,2}:?\s*/i, "").trim();
            exitHandle = "interrupcao";
            console.log("Assistente IA: INTERRUPCAO detected via includes fallback");
          }

          // Send response to contact
          if (resposta) {
            await sendZapiText(zapiConfig, phone, resposta);
            await saveBotMessage(supabase, conversaId, tenantId, resposta);
          }

          if (exitHandle) {
            // Exit the AI loop, follow the appropriate handle
            const edge = edges.find(e => e.source === currentNode.id && e.sourceHandle === exitHandle);
            const nextNodeId = edge?.target || null;

            if (nextNodeId) {
              await supabase
                .from("fluxo_sessoes")
                .update({ node_atual: nextNodeId, aguardando_resposta: false, dados: {}, updated_at: new Date().toISOString() })
                .eq("id", sessao.id);

              await executeFlowFrom(supabase, tenantId, phone, conversaId, contatoId, contato, zapiConfig, nodes, edges, nextNodeId, sessao.id, sessao.fluxo_id);
            } else {
              await supabase.from("fluxo_sessoes").delete().eq("id", sessao.id);
              console.log("Flow ended after assistente_ia exit (no next node)");
            }
          } else {
            // Continue multi-turn: update history and keep waiting
            const updatedHistorico = [
              ...historicoIa,
              { role: "user", content: messageText },
              { role: "assistant", content: resposta },
            ];

            // Limit history to last 20 messages to avoid token overflow
            const trimmedHistorico = updatedHistorico.slice(-20);

            await supabase
              .from("fluxo_sessoes")
              .update({
                dados: { historico_ia: trimmedHistorico, ultima_interacao: new Date().toISOString() },
                updated_at: new Date().toISOString(),
              })
              .eq("id", sessao.id);
            console.log(`Assistente IA: multi-turn continues, history size: ${trimmedHistorico.length}`);
          }
          return true;
        } catch (aiErr) {
          console.error("Assistente IA error:", aiErr);
          await sendZapiText(zapiConfig, phone, msgErro);
          await saveBotMessage(supabase, conversaId, tenantId, msgErro);
          return true;
        }
      }

      // Non-menu/triagem/assistente waiting state — shouldn't happen, clean up
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

    // 3. No trigger matched — check for "Fluxo de Resposta Padrão"
    // Only activate if the conversation has no human agent assigned
    const { data: conversa } = await supabase
      .from("conversas")
      .select("atendente_id")
      .eq("id", conversaId)
      .single();

    if (conversa?.atendente_id) {
      console.log("Conversation has active agent, skipping default flow");
      return false;
    }

    const { data: defaultFlowConfig } = await supabase
      .from("fluxo_config")
      .select("fluxo_id")
      .eq("tenant_id", tenantId)
      .eq("tipo", "resposta_padrao")
      .eq("ativo", true)
      .maybeSingle();

    if (defaultFlowConfig?.fluxo_id) {
      console.log("Default flow configured:", defaultFlowConfig.fluxo_id);

      // Load the default flow
      const { data: defaultFluxo } = await supabase
        .from("fluxos")
        .select("id, nodes_json, edges_json")
        .eq("id", defaultFlowConfig.fluxo_id)
        .eq("tenant_id", tenantId)
        .single();

      if (defaultFluxo) {
        const nodes: FlowNode[] = defaultFluxo.nodes_json || [];
        const edges: FlowEdge[] = defaultFluxo.edges_json || [];

        // Find the first executable node: skip gatilho, go to its target
        const gatilhoNode = nodes.find(n => n.data?.nodeType === "gatilho");
        let firstNodeId: string | null = null;

        if (gatilhoNode) {
          const edge = edges.find(e => e.source === gatilhoNode.id);
          firstNodeId = edge?.target || null;
        } else {
          // No gatilho node — find a node that isn't targeted by any edge (root node)
          const targetIds = new Set(edges.map(e => e.target));
          const rootNode = nodes.find(n => !targetIds.has(n.id) && n.data?.nodeType !== "gatilho");
          firstNodeId = rootNode?.id || nodes[0]?.id || null;
        }

        if (firstNodeId) {
          console.log(`Activating default flow ${defaultFluxo.id} from node ${firstNodeId}`);

          // Create session
          const { data: newSessao } = await supabase
            .from("fluxo_sessoes")
            .upsert({
              conversa_id: conversaId,
              fluxo_id: defaultFluxo.id,
              tenant_id: tenantId,
              node_atual: firstNodeId,
              aguardando_resposta: false,
              dados: {},
              updated_at: new Date().toISOString(),
            }, { onConflict: "conversa_id" })
            .select("id")
            .single();

          const contato = await getContato(supabase, contatoId);
          await executeFlowFrom(supabase, tenantId, phone, conversaId, contatoId, contato, zapiConfig, nodes, edges, firstNodeId, newSessao?.id, defaultFluxo.id);
          return true;
        }
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

        if (tipoMenu === "botoes" && opcoes.length > 0 && opcoes.length <= 4) {
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
        // Send initial message if configured
        const msgInicial = config.msg_inicial || "";
        if (msgInicial && config.msg_inicial_tipo !== "sistema") {
          const msgInicialText = replaceVariables(msgInicial, contato);
          await sendZapiText(zapiConfig, phone, msgInicialText);
          await saveBotMessage(supabase, conversaId, tenantId, msgInicialText);
        }

        // Mark session as waiting for response (multi-turn AI conversation)
        if (sessaoId) {
          await supabase
            .from("fluxo_sessoes")
            .update({
              node_atual: node.id,
              aguardando_resposta: true,
              dados: { historico_ia: [], ultima_interacao: new Date().toISOString() },
              updated_at: new Date().toISOString(),
            })
            .eq("id", sessaoId);
        }
        console.log("Assistente IA initialized, waiting for user message");
        return; // STOP execution, wait for next message
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

      case "auto_off": {
        const acaoAutoOff = config.acao || "desligar";
        
        // Fetch current session data to merge (preserve historico_ia etc.)
        let currentDados: any = {};
        if (sessaoId) {
          const { data: currentSessao } = await supabase
            .from("fluxo_sessoes")
            .select("dados")
            .eq("id", sessaoId)
            .single();
          currentDados = currentSessao?.dados || {};
        }

        if (acaoAutoOff === "religar") {
          if (sessaoId) {
            await supabase
              .from("fluxo_sessoes")
              .update({
                dados: { ...currentDados, auto_off_ate: null },
                updated_at: new Date().toISOString(),
              })
              .eq("id", sessaoId);
          }
          console.log("Auto-off: religar — automatic responses re-enabled");
        } else {
          let durationSecs = 0;
          if ((config.formato || "hms") === "dias") {
            durationSecs = (config.dias || 1) * 86400;
          } else {
            durationSecs = (config.horas || 0) * 3600 + (config.minutos || 5) * 60 + (config.segundos || 0);
          }
          const autoOffAte = new Date(Date.now() + durationSecs * 1000).toISOString();

          if (sessaoId) {
            await supabase
              .from("fluxo_sessoes")
              .update({
                dados: { ...currentDados, auto_off_ate: autoOffAte },
                updated_at: new Date().toISOString(),
              })
              .eq("id", sessaoId);
          }
          console.log(`Auto-off set until ${autoOffAte} (${durationSecs}s)`);
        }
        break;
      }

      case "gerenciar_conversa": {
        const acaoConversa = config.acao || "fechar";
        const motivo = config.motivo || "";
        const novoStatus = acaoConversa === "abrir" ? "aberta" : "fechada";

        await supabase
          .from("conversas")
          .update({ status: novoStatus })
          .eq("id", conversaId);

        // Insert system message
        const sysMsg = acaoConversa === "abrir"
          ? "Conversa reaberta pelo fluxo automático" + (motivo ? ` — ${motivo}` : "")
          : "Conversa fechada pelo fluxo automático" + (motivo ? ` — ${motivo}` : "");
        await supabase.from("mensagens").insert({
          conversa_id: conversaId,
          tenant_id: tenantId,
          conteudo: sysMsg,
          remetente: "sistema",
          tipo: "texto",
        });

        console.log(`Gerenciar conversa: ${novoStatus}${motivo ? ` (${motivo})` : ""}`);
        break;
      }

      case "triagem_ia": {
        // Send greeting and wait for response
        const saudacao = replaceVariables(config.saudacao || "Olá! Como posso ajudar?", contato);
        await sendZapiText(zapiConfig, phone, saudacao);
        await saveBotMessage(supabase, conversaId, tenantId, saudacao);

        // Pause — wait for user response
        if (sessaoId) {
          await supabase
            .from("fluxo_sessoes")
            .update({ node_atual: node.id, aguardando_resposta: true, dados: { triagem_tentativas: 0 }, updated_at: new Date().toISOString() })
            .eq("id", sessaoId);
        }
        console.log("Triagem IA sent greeting, waiting for response");
        return; // STOP execution, wait for next message
      }

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

async function sendZapiButtons(zapiConfig: any, phone: string, message: string, opcoes: string[]) {
  const sendUrl = `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-button-list`;
  try {
    const buttons = opcoes.map((op: string) => ({ id: op, label: op }));
    const resp = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": zapiConfig.client_token,
      },
      body: JSON.stringify({ phone, message, buttonList: { buttons } }),
    });
    const respBody = await resp.text();
    console.log("Z-API send-button-list:", resp.status, respBody);
  } catch (err) {
    console.error("Z-API button send error:", err);
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

  // ---- TEXT (cobre formatos diferentes vistos em mensagens enviadas vs recebidas)
  // payload.text.message (recebida padrão)
  // payload.text.body / payload.text (string)
  // payload.message (string)
  // payload.body / payload.conversation
  // payload.extendedTextMessage.text (formato bruto WA)
  if (payload?.text && typeof payload.text === "object") {
    messageText =
      payload.text.message ??
      payload.text.body ??
      payload.text.text ??
      payload.text.caption ??
      null;
  } else if (typeof payload?.text === "string") {
    messageText = payload.text;
  }

  if (!messageText && typeof payload?.message === "string") {
    messageText = payload.message;
  }
  if (!messageText && typeof payload?.body === "string") {
    messageText = payload.body;
  }
  if (!messageText && typeof payload?.conversation === "string") {
    messageText = payload.conversation;
  }
  if (!messageText && payload?.extendedTextMessage?.text) {
    messageText = payload.extendedTextMessage.text;
  }
  if (!messageText && payload?.notifyName && payload?.caption) {
    // raw WA caption fallback
    messageText = payload.caption;
  }

  if (messageText) {
    messageType = "texto";
    messageContent = messageText;
    return { messageType, messageContent, messageText };
  }

  if (payload.image) {
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
  } else if (payload.buttonsResponseMessage) {
    messageText = payload.buttonsResponseMessage.selectedButtonId || payload.buttonsResponseMessage.selectedDisplayText || "";
    messageType = "texto";
    messageContent = messageText;
  } else if (payload.listResponseMessage) {
    messageText = payload.listResponseMessage.title || payload.listResponseMessage.singleSelectReply?.selectedRowId || "";
    messageType = "texto";
    messageContent = messageText;
  }

  return { messageType, messageContent, messageText };
}

async function findOrCreateContact(supabase: any, tenantId: string, phone: string, name: string) {
  // 1) Lookup atômico — usa maybeSingle para tolerar 0 resultados sem erro
  const { data: existing } = await supabase
    .from("contatos")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("telefone", phone)
    .maybeSingle();

  if (existing) return existing;

  // 2) Insert; se outra requisição paralela criou primeiro (UNIQUE constraint),
  //    relê o registro existente
  const { data: inserted, error: insertErr } = await supabase
    .from("contatos")
    .insert({ tenant_id: tenantId, nome: name, telefone: phone })
    .select("id")
    .maybeSingle();

  if (inserted) return inserted;

  // Race: já existe — buscar de novo
  if (insertErr && (insertErr.code === "23505" || /duplicate|unique/i.test(insertErr.message || ""))) {
    const { data: retry } = await supabase
      .from("contatos")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("telefone", phone)
      .maybeSingle();
    if (retry) return retry;
  }

  console.error("findOrCreateContact failed:", insertErr);
  return null;
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
