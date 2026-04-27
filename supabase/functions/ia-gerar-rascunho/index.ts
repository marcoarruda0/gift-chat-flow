import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // user-scoped client to identify caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const conversaId = body?.conversa_id as string | undefined;
    const forcar = !!body?.forcar;
    if (!conversaId) {
      return new Response(JSON.stringify({ error: "conversa_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch profile -> tenant
    const { data: profile } = await supabase
      .from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Sem tenant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch ia_config
    const { data: cfg } = await supabase
      .from("ia_config").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (!cfg || !cfg.copiloto_ativo) {
      return new Response(JSON.stringify({ skip: true, reason: "copiloto_inativo" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch conversa (validate tenant + canal allowed)
    const { data: conversa } = await supabase
      .from("conversas")
      .select("id, tenant_id, canal")
      .eq("id", conversaId).maybeSingle();
    if (!conversa || conversa.tenant_id !== tenantId) {
      return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const canalKey = conversa.canal === "whatsapp_cloud" ? "whatsapp_cloud" : "whatsapp_zapi";
    const canaisHabilitados: string[] = cfg.copiloto_canais || [];
    if (canaisHabilitados.length > 0 && !canaisHabilitados.includes(canalKey)) {
      return new Response(JSON.stringify({ skip: true, reason: "canal_desabilitado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Last 15 messages
    const { data: msgsRaw } = await supabase
      .from("mensagens")
      .select("id, conteudo, remetente, tipo, created_at")
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: false })
      .limit(15);
    const mensagens = (msgsRaw || []).reverse();

    // Last contact message id (to dedupe)
    const lastContactMsg = [...mensagens].reverse().find((m: any) => m.remetente === "contato");
    const baseadoEm = lastContactMsg?.id || null;

    // Reuse pending draft if same base
    if (!forcar && baseadoEm) {
      const { data: existing } = await supabase
        .from("ia_rascunhos")
        .select("id, conteudo_sugerido, fontes")
        .eq("conversa_id", conversaId)
        .eq("status", "pendente")
        .eq("baseado_em_mensagem_id", baseadoEm)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({
          id: existing.id,
          conteudo: existing.conteudo_sugerido,
          fontes: existing.fontes || [],
          reused: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Mark previous pending drafts as descartado (only one active per conversa)
    await supabase
      .from("ia_rascunhos")
      .update({ status: "descartado" })
      .eq("conversa_id", conversaId)
      .eq("status", "pendente");

    // Knowledge base
    const { data: artigos } = await supabase
      .from("conhecimento_base")
      .select("titulo, conteudo, categoria")
      .eq("tenant_id", tenantId)
      .eq("ativo", true);

    const tomMap: Record<string, string> = {
      formal: "Tom profissional, formal e objetivo.",
      amigavel: "Tom cordial, simpático e próximo, como um atendente bem treinado.",
      casual: "Tom descontraído, leve e informal.",
    };
    const emojiMap: Record<string, string> = {
      nao: "NÃO use emojis.",
      pouco: "Use emojis com moderação (1-2 no máximo).",
      sim: "Use emojis de forma expressiva.",
    };

    const contexto = (artigos || [])
      .map((a: any, i: number) => `[${i + 1}] ${a.titulo} (${a.categoria})\n${a.conteudo}`)
      .join("\n\n---\n\n") || "(base de conhecimento vazia)";

    const historico = mensagens
      .map((m: any) => {
        const quem = m.remetente === "contato" ? "CLIENTE" :
          m.remetente === "atendente" ? "ATENDENTE" :
          m.remetente === "ia" ? "IA" : "SISTEMA";
        const conteudo = m.tipo === "texto" ? m.conteudo : `[${m.tipo}]`;
        return `${quem}: ${conteudo}`;
      }).join("\n");

    const systemPrompt = `Você é ${cfg.nome_assistente || "Assistente Virtual"}, atuando como COPILOTO de um atendente humano.
Sua tarefa: gerar UMA SUGESTÃO DE RESPOSTA curta e útil, que o atendente possa enviar como está OU editar antes de enviar.

${tomMap[cfg.tom] || tomMap.amigavel}
${emojiMap[cfg.usar_emojis] || emojiMap.pouco}

Regras importantes:
- Responda APENAS com o texto da mensagem a ser enviada ao cliente. Sem prefixos como "Sugestão:", sem explicações, sem aspas.
- Use as informações da BASE DE CONHECIMENTO quando relevante. Se a base não cobrir, peça mais detalhes ao cliente ou indique que vai verificar.
- Não invente dados (preços, prazos, estoque) que não estejam na base.
- Mantenha a resposta concisa (máx ~3 frases curtas) e em português brasileiro.
${cfg.instrucoes_extras ? `\nINSTRUÇÕES ADICIONAIS:\n${cfg.instrucoes_extras}` : ""}

BASE DE CONHECIMENTO:
${contexto}

HISTÓRICO RECENTE DA CONVERSA:
${historico || "(sem mensagens ainda)"}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Gere a sugestão de resposta agora." },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições da IA. Tente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const txt = await aiResponse.text();
      console.error("AI error", status, txt);
      return new Response(JSON.stringify({ error: "Erro ao consultar IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ai = await aiResponse.json();
    let conteudo: string = ai.choices?.[0]?.message?.content?.trim() || "";
    // strip surrounding quotes if model added them
    conteudo = conteudo.replace(/^["'`]+|["'`]+$/g, "").trim();
    if (!conteudo) {
      return new Response(JSON.stringify({ error: "IA retornou resposta vazia" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fontes = (artigos || []).map((a: any) => a.titulo);

    const { data: inserted, error: insErr } = await supabase
      .from("ia_rascunhos")
      .insert({
        tenant_id: tenantId,
        conversa_id: conversaId,
        atendente_id: userId,
        conteudo_sugerido: conteudo,
        baseado_em_mensagem_id: baseadoEm,
        fontes,
        status: "pendente",
      })
      .select("id")
      .single();
    if (insErr) {
      console.error("insert rascunho err:", insErr);
    }

    return new Response(JSON.stringify({
      id: inserted?.id,
      conteudo,
      fontes,
      reused: false,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ia-gerar-rascunho error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
