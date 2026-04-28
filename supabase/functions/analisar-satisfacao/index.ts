import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const MODEL = "google/gemini-3-flash-preview";
const BATCH = 20;

interface Mensagem {
  id: string;
  remetente: string;
  tipo: string;
  conteudo: string;
  metadata: any;
  created_at: string;
}

function fmtMessages(msgs: Mensagem[]): string {
  return msgs
    .map((m) => {
      const auto =
        m.metadata?.fluxo_id ||
        m.metadata?.campanha_id ||
        m.metadata?.automatico === true;
      const tag = auto
        ? "[automático]"
        : m.remetente === "cliente"
        ? "[cliente]"
        : m.remetente === "ia"
        ? "[ia]"
        : "[atendente]";
      const t = new Date(m.created_at).toLocaleString("pt-BR");
      const conteudo =
        m.tipo === "texto" ? m.conteudo : `(${m.tipo}) ${m.conteudo || ""}`;
      return `${t} ${tag} ${conteudo}`;
    })
    .join("\n");
}

function calcMetricas(msgs: Mensagem[]) {
  const cliente = msgs.filter((m) => m.remetente === "cliente");
  const atendente = msgs.filter(
    (m) => m.remetente !== "cliente" && !m.metadata?.fluxo_id && !m.metadata?.campanha_id,
  );
  const total_mensagens_cliente = cliente.length;
  const total_mensagens_atendente = atendente.length;

  // Primeiro tempo de resposta: 1ª msg cliente -> 1ª msg atendente após ela
  let primeiro_resp_segundos: number | null = null;
  if (cliente.length > 0) {
    const t0 = new Date(cliente[0].created_at).getTime();
    const respAt = atendente.find(
      (m) => new Date(m.created_at).getTime() > t0,
    );
    if (respAt) {
      primeiro_resp_segundos = Math.round(
        (new Date(respAt.created_at).getTime() - t0) / 1000,
      );
    }
  }

  // Tempo médio entre msg do cliente e próxima resposta do atendente
  const intervalos: number[] = [];
  for (const c of cliente) {
    const tc = new Date(c.created_at).getTime();
    const r = atendente.find((m) => new Date(m.created_at).getTime() > tc);
    if (r) intervalos.push((new Date(r.created_at).getTime() - tc) / 1000);
  }
  const tempo_medio_resposta_segundos =
    intervalos.length > 0
      ? Math.round(intervalos.reduce((a, b) => a + b, 0) / intervalos.length)
      : null;

  const duracao_segundos =
    msgs.length >= 2
      ? Math.round(
          (new Date(msgs[msgs.length - 1].created_at).getTime() -
            new Date(msgs[0].created_at).getTime()) /
            1000,
        )
      : 0;

  // Terminou sem resposta = última mensagem é do cliente
  const terminou_sem_resposta =
    msgs.length > 0 && msgs[msgs.length - 1].remetente === "cliente";

  return {
    total_mensagens_cliente,
    total_mensagens_atendente,
    primeiro_resp_segundos,
    tempo_medio_resposta_segundos,
    duracao_segundos,
    terminou_sem_resposta,
  };
}

async function processOne(supabase: any, item: any) {
  // Marca processando
  await supabase
    .from("atendimento_satisfacao")
    .update({ status: "processando" })
    .eq("id", item.id);

  // Carrega config do tenant
  const { data: cfg } = await supabase
    .from("ia_config")
    .select("satisfacao_ativo, satisfacao_criterios, satisfacao_min_mensagens_cliente")
    .eq("tenant_id", item.tenant_id)
    .maybeSingle();

  if (!cfg?.satisfacao_ativo) {
    await supabase
      .from("atendimento_satisfacao")
      .update({
        status: "ignorado",
        motivo_ignorado: "Análise de satisfação desativada",
        processado_em: new Date().toISOString(),
      })
      .eq("id", item.id);
    return;
  }

  const minCli = cfg.satisfacao_min_mensagens_cliente ?? 2;
  const criterios = cfg.satisfacao_criterios?.trim() || "";

  // Carrega mensagens
  const { data: mensagens } = await supabase
    .from("mensagens")
    .select("id, remetente, tipo, conteudo, metadata, created_at")
    .eq("conversa_id", item.conversa_id)
    .order("created_at", { ascending: true });

  const msgs: Mensagem[] = mensagens || [];

  // Verifica transferências
  const { count: transfCount } = await supabase
    .from("conversa_transferencias")
    .select("id", { count: "exact", head: true })
    .eq("conversa_id", item.conversa_id);
  const houve_transferencia = (transfCount || 0) > 0;

  const metricas = calcMetricas(msgs);

  if (metricas.total_mensagens_cliente < minCli) {
    await supabase
      .from("atendimento_satisfacao")
      .update({
        ...metricas,
        houve_transferencia,
        status: "ignorado",
        motivo_ignorado: `Conversa muito curta (< ${minCli} mensagens do cliente)`,
        processado_em: new Date().toISOString(),
      })
      .eq("id", item.id);
    return;
  }

  if (metricas.total_mensagens_atendente === 0) {
    await supabase
      .from("atendimento_satisfacao")
      .update({
        ...metricas,
        houve_transferencia,
        status: "ignorado",
        motivo_ignorado: "Nenhuma resposta humana/IA na conversa",
        processado_em: new Date().toISOString(),
      })
      .eq("id", item.id);
    return;
  }

  const transcricao = fmtMessages(msgs);

  const sysPrompt = `Você é um analista de qualidade de atendimento. Avalie OBJETIVAMENTE a satisfação do cliente nesta conversa de WhatsApp.

CRITÉRIOS DO TENANT:
${criterios || "(nenhum critério extra definido — use bom senso geral)"}

REGRAS:
- Considere TANTO o conteúdo (palavras de elogio/reclamação, resolução, tom do cliente) quanto as MÉTRICAS OPERACIONAIS abaixo.
- Mensagens marcadas como [automático] são respostas de fluxo/disparo: NÃO conte como atendimento humano.
- Se o cliente foi ignorado, teve respostas lentas ou a conversa terminou sem resposta, isso pesa NEGATIVAMENTE.
- Justificativa deve ser curta e objetiva (1-3 frases).
- pontos_positivos e pontos_negativos: até 5 itens cada, frases curtas em português.
- Score 1=muito_insatisfeito, 5=muito_satisfeito.`;

  const userPrompt = `MÉTRICAS OPERACIONAIS:
- Mensagens do cliente: ${metricas.total_mensagens_cliente}
- Mensagens humanas/IA do atendente: ${metricas.total_mensagens_atendente}
- Tempo até primeira resposta: ${metricas.primeiro_resp_segundos != null ? metricas.primeiro_resp_segundos + "s" : "N/A"}
- Tempo médio de resposta: ${metricas.tempo_medio_resposta_segundos != null ? metricas.tempo_medio_resposta_segundos + "s" : "N/A"}
- Duração total: ${metricas.duracao_segundos}s
- Houve transferência entre atendentes: ${houve_transferencia ? "SIM" : "NÃO"}
- Terminou sem resposta do atendente: ${metricas.terminou_sem_resposta ? "SIM" : "NÃO"}

TRANSCRIÇÃO DA CONVERSA:
${transcricao}

Classifique a satisfação chamando a função classificar_satisfacao.`;

  const tool = {
    type: "function",
    function: {
      name: "classificar_satisfacao",
      description: "Retorna a classificação objetiva da satisfação do cliente.",
      parameters: {
        type: "object",
        properties: {
          classificacao: {
            type: "string",
            enum: [
              "muito_insatisfeito",
              "insatisfeito",
              "neutro",
              "satisfeito",
              "muito_satisfeito",
            ],
          },
          score: { type: "integer", minimum: 1, maximum: 5 },
          sentimento: {
            type: "string",
            enum: ["positivo", "neutro", "negativo"],
          },
          justificativa: { type: "string" },
          pontos_positivos: { type: "array", items: { type: "string" } },
          pontos_negativos: { type: "array", items: { type: "string" } },
        },
        required: [
          "classificacao",
          "score",
          "sentimento",
          "justificativa",
          "pontos_positivos",
          "pontos_negativos",
        ],
        additionalProperties: false,
      },
    },
  };

  const aiResp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: {
          type: "function",
          function: { name: "classificar_satisfacao" },
        },
      }),
    },
  );

  if (!aiResp.ok) {
    const txt = await aiResp.text();
    await supabase
      .from("atendimento_satisfacao")
      .update({
        ...metricas,
        houve_transferencia,
        status: "erro",
        erro: `AI ${aiResp.status}: ${txt.slice(0, 500)}`,
        processado_em: new Date().toISOString(),
      })
      .eq("id", item.id);
    return;
  }

  const json = await aiResp.json();
  const call = json?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    await supabase
      .from("atendimento_satisfacao")
      .update({
        ...metricas,
        houve_transferencia,
        status: "erro",
        erro: "Sem tool_call retornada",
        processado_em: new Date().toISOString(),
      })
      .eq("id", item.id);
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(call.function.arguments);
  } catch (e) {
    await supabase
      .from("atendimento_satisfacao")
      .update({
        ...metricas,
        houve_transferencia,
        status: "erro",
        erro: "JSON inválido: " + (e as Error).message,
        processado_em: new Date().toISOString(),
      })
      .eq("id", item.id);
    return;
  }

  await supabase
    .from("atendimento_satisfacao")
    .update({
      ...metricas,
      houve_transferencia,
      classificacao: parsed.classificacao,
      score: parsed.score,
      sentimento: parsed.sentimento,
      justificativa: parsed.justificativa,
      pontos_positivos: parsed.pontos_positivos || [],
      pontos_negativos: parsed.pontos_negativos || [],
      status: "concluido",
      processado_em: new Date().toISOString(),
    })
    .eq("id", item.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let reanalise_tenant: string | null = null;
  let reanalise_dias = 30;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.reanalise_tenant_id) {
        reanalise_tenant = body.reanalise_tenant_id;
        reanalise_dias = body.dias ?? 30;
      }
    } catch {}
  }

  // Reanálise: enfileira conversas encerradas sem registro
  if (reanalise_tenant) {
    const desde = new Date(Date.now() - reanalise_dias * 24 * 3600 * 1000).toISOString();
    const { data: convs } = await supabase
      .from("conversas")
      .select("id, tenant_id, contato_id, atendente_id, departamento_id, canal")
      .eq("tenant_id", reanalise_tenant)
      .in("canal", ["zapi", "whatsapp_cloud"])
      .not("atendimento_encerrado_at", "is", null)
      .gte("atendimento_encerrado_at", desde)
      .limit(500);

    let inseridos = 0;
    for (const c of convs || []) {
      const { error } = await supabase
        .from("atendimento_satisfacao")
        .insert({
          tenant_id: c.tenant_id,
          conversa_id: c.id,
          contato_id: c.contato_id,
          atendente_id: c.atendente_id,
          departamento_id: c.departamento_id,
          canal: c.canal,
          status: "pendente",
        });
      if (!error) inseridos++;
    }
    return new Response(
      JSON.stringify({ ok: true, enfileirados: inseridos }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Processa pendentes
  const { data: pendentes } = await supabase
    .from("atendimento_satisfacao")
    .select("id, tenant_id, conversa_id, contato_id, atendente_id, canal")
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .limit(BATCH);

  let processados = 0;
  let erros = 0;

  for (const item of pendentes || []) {
    try {
      await processOne(supabase, item);
      processados++;
    } catch (e) {
      erros++;
      console.error("Erro item", item.id, e);
      await supabase
        .from("atendimento_satisfacao")
        .update({
          status: "erro",
          erro: (e as Error).message?.slice(0, 500),
          processado_em: new Date().toISOString(),
        })
        .eq("id", item.id);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      total_pendentes: pendentes?.length || 0,
      processados,
      erros,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
