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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate role
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles || []).some((r: any) => r.role === "admin_tenant" || r.role === "admin_master");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem rodar análises" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: "Sem tenant" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const periodoFim = body?.periodo_fim ? new Date(body.periodo_fim) : new Date();
    const periodoInicio = body?.periodo_inicio
      ? new Date(body.periodo_inicio)
      : new Date(periodoFim.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Create analise registry
    const { data: analise, error: anaErr } = await supabase
      .from("ia_analises_conversas")
      .insert({
        tenant_id: tenantId,
        iniciado_por: userId,
        periodo_inicio: periodoInicio.toISOString(),
        periodo_fim: periodoFim.toISOString(),
        status: "rodando",
      })
      .select("id").single();
    if (anaErr || !analise) {
      console.error("create analise err:", anaErr);
      return new Response(JSON.stringify({ error: "Erro ao criar análise" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      // Fetch conversas no período (limit 200)
      const { data: convs } = await supabase
        .from("conversas")
        .select("id, contato_id, contatos(nome)")
        .eq("tenant_id", tenantId)
        .gte("created_at", periodoInicio.toISOString())
        .lte("created_at", periodoFim.toISOString())
        .order("ultima_msg_at", { ascending: false })
        .limit(200);

      const convIds = (convs || []).map((c: any) => c.id);
      let totalConv = convIds.length;
      let totalMsg = 0;
      let blocoConversas = "";

      if (convIds.length > 0) {
        const { data: msgs } = await supabase
          .from("mensagens")
          .select("conversa_id, remetente, tipo, conteudo, created_at")
          .in("conversa_id", convIds)
          .order("created_at", { ascending: true })
          .limit(2000);
        totalMsg = (msgs || []).length;

        // Group by conversa
        const map: Record<string, any[]> = {};
        for (const m of (msgs || [])) {
          (map[(m as any).conversa_id] ||= []).push(m);
        }
        const partes: string[] = [];
        for (const c of (convs || [])) {
          const arr = map[(c as any).id] || [];
          if (arr.length === 0) continue;
          const nome = (c as any).contatos?.nome || "Contato";
          const linhas = arr.slice(0, 30).map((m: any) => {
            const quem = m.remetente === "contato" ? "C" :
              m.remetente === "atendente" ? "A" :
              m.remetente === "ia" ? "I" : "S";
            const conteudo = m.tipo === "texto" ? m.conteudo : `[${m.tipo}]`;
            return `${quem}: ${(conteudo || "").slice(0, 200)}`;
          }).join("\n");
          partes.push(`### Conversa com ${nome}\n${linhas}`);
        }
        // Limit total characters to stay within context budget
        let acc = "";
        for (const p of partes) {
          if (acc.length + p.length > 60000) break;
          acc += p + "\n\n";
        }
        blocoConversas = acc;
      }

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

      const systemPrompt = `Você é um analista de atendimento ao cliente. Sua tarefa é varrer um conjunto de conversas reais entre clientes e atendentes, e produzir um diagnóstico estruturado para o ADMIN ajustar o prompt da IA de atendimento.

Você DEVE chamar a função analisar_conversas com os campos solicitados.

Importante:
- "sugestoes_instrucoes" deve ser um TEXTO PRONTO em português brasileiro, em formato de bullet points, que o admin possa COLAR DIRETAMENTE no campo "Instruções Personalizadas" da IA. Foque em regras de comportamento (tom, o que evitar, como abordar dúvidas comuns), não em conteúdo de produto.
- "resumo_markdown" é um diagnóstico legível em markdown com as seções: Visão geral, Temas recorrentes, Dúvidas frequentes, Gaps na base de conhecimento, Padrões dos atendentes, Recomendações.
- Se houver poucos dados, gere o resumo possível e marque os campos como "Dados insuficientes".`;

      const userMsg = `Período analisado: ${periodoInicio.toISOString()} até ${periodoFim.toISOString()}.
Total de conversas: ${totalConv}. Total de mensagens: ${totalMsg}.

CONVERSAS:
${blocoConversas || "(sem conversas no período)"}`;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMsg },
          ],
          tools: [{
            type: "function",
            function: {
              name: "analisar_conversas",
              description: "Retorna análise estruturada das conversas",
              parameters: {
                type: "object",
                properties: {
                  resumo_markdown: { type: "string" },
                  sugestoes_instrucoes: { type: "string" },
                },
                required: ["resumo_markdown", "sugestoes_instrucoes"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "analisar_conversas" } },
        }),
      });

      if (!aiResp.ok) {
        if (aiResp.status === 429) throw new Error("Limite de requisições da IA. Tente em instantes.");
        if (aiResp.status === 402) throw new Error("Créditos de IA esgotados.");
        const t = await aiResp.text();
        console.error("AI err:", aiResp.status, t);
        throw new Error("Erro ao consultar IA");
      }

      const ai = await aiResp.json();
      const toolCall = ai.choices?.[0]?.message?.tool_calls?.[0];
      const args = toolCall?.function?.arguments;
      let parsed: any = {};
      try { parsed = args ? JSON.parse(args) : {}; } catch (_) { parsed = {}; }
      const resumo = parsed.resumo_markdown || ai.choices?.[0]?.message?.content || "Sem resumo.";
      const sugestoes = parsed.sugestoes_instrucoes || "";

      await supabase.from("ia_analises_conversas").update({
        status: "concluido",
        concluido_em: new Date().toISOString(),
        total_conversas: totalConv,
        total_mensagens: totalMsg,
        resumo_markdown: resumo,
        sugestoes_instrucoes: sugestoes,
      }).eq("id", analise.id);

      await supabase.from("ia_config").update({
        ultima_analise_em: new Date().toISOString(),
        ultima_analise_resumo: resumo,
      }).eq("tenant_id", tenantId);

      return new Response(JSON.stringify({
        id: analise.id,
        resumo_markdown: resumo,
        sugestoes_instrucoes: sugestoes,
        total_conversas: totalConv,
        total_mensagens: totalMsg,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (innerErr: any) {
      await supabase.from("ia_analises_conversas").update({
        status: "erro",
        erro_mensagem: innerErr?.message || "Erro desconhecido",
        concluido_em: new Date().toISOString(),
      }).eq("id", analise.id);
      throw innerErr;
    }
  } catch (e: any) {
    console.error("ia-analisar-conversas error:", e);
    const msg = e?.message || "Erro";
    const status = msg.includes("Limite") ? 429 : msg.includes("Créditos") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
