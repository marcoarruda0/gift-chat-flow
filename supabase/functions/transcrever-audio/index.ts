import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_RETRIES = 3;
const BATCH_SIZE = 8;
const MODEL = "google/gemini-2.5-flash";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

interface MensagemRow {
  id: string;
  tenant_id: string;
  conteudo: string;
  metadata: Record<string, any> | null;
}

async function fetchAudioBase64(url: string): Promise<{ base64: string; mime: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha ao baixar áudio (${resp.status})`);
  const contentLen = Number(resp.headers.get("content-length") || "0");
  if (contentLen > MAX_BYTES) throw new Error("Áudio maior que 10 MB");

  const buf = new Uint8Array(await resp.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error("Áudio maior que 10 MB");

  const mime = resp.headers.get("content-type")?.split(";")[0]?.trim() || "audio/ogg";

  // base64 encode
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk) as unknown as number[]);
  }
  return { base64: btoa(binary), mime };
}

async function transcreverComIA(base64: string, mime: string, idioma: string): Promise<string> {
  const idiomaInstr = !idioma || idioma === "auto"
    ? "no idioma original do áudio"
    : `em ${idioma === "pt" ? "português" : idioma === "es" ? "espanhol" : idioma === "en" ? "inglês" : idioma}`;

  const body = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content: "Você é um transcritor de áudio. Retorne apenas o texto transcrito, sem comentários, sem aspas, sem prefixos.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Transcreva este áudio fielmente ${idiomaInstr}. Retorne apenas o texto, sem nenhum comentário adicional. Se o áudio for incompreensível ou silencioso, retorne exatamente: [áudio sem fala detectada]`,
          },
          {
            type: "input_audio",
            input_audio: { data: base64, format: mime.includes("mp3") ? "mp3" : mime.includes("wav") ? "wav" : "ogg" },
          },
        ],
      },
    ],
  };

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 429) throw new Error("RATE_LIMIT");
  if (resp.status === 402) throw new Error("PAYMENT_REQUIRED");
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI ${resp.status}: ${t.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content?.toString().trim() || "";
  if (!text) throw new Error("Resposta vazia da IA");
  return text;
}

async function processarMensagem(m: MensagemRow, idiomaTenant: string) {
  const meta = m.metadata || {};
  const tentativas = Number(meta.transcricao_tentativas || 0);

  // mark processing
  await admin.from("mensagens").update({
    metadata: { ...meta, transcricao_status: "processando", transcricao_tentativas: tentativas + 1 },
  }).eq("id", m.id);

  try {
    const { base64, mime } = await fetchAudioBase64(m.conteudo);
    const texto = await transcreverComIA(base64, mime, idiomaTenant);

    await admin.from("mensagens").update({
      metadata: {
        ...meta,
        transcricao_status: "concluido",
        transcricao_texto: texto,
        transcricao_idioma: idiomaTenant || "auto",
        transcricao_modelo: MODEL,
        transcricao_processado_em: new Date().toISOString(),
        transcricao_tentativas: tentativas + 1,
        transcricao_erro: null,
      },
    }).eq("id", m.id);
    return { id: m.id, ok: true };
  } catch (e: any) {
    const msg = e?.message || String(e);
    const isRate = msg === "RATE_LIMIT";
    const isPay = msg === "PAYMENT_REQUIRED";
    const newStatus = isRate
      ? "pendente" // try again later
      : tentativas + 1 >= MAX_RETRIES || isPay
        ? "erro"
        : "pendente";
    await admin.from("mensagens").update({
      metadata: {
        ...meta,
        transcricao_status: newStatus,
        transcricao_erro: msg.slice(0, 500),
        transcricao_tentativas: tentativas + 1,
      },
    }).eq("id", m.id);
    return { id: m.id, ok: false, error: msg };
  }
}

async function getIdiomaTenant(tenantId: string): Promise<string> {
  const { data } = await admin.from("ia_config")
    .select("transcricao_audio_idioma")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data?.transcricao_audio_idioma as string) || "pt";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = {}; }
    }

    const mode = body.mode || (body.mensagem_id ? "manual" : "batch");

    // ---------- MANUAL (single message, requires auth) ----------
    if (mode === "manual") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: authErr } = await userClient.auth.getUser();
      if (authErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const mensagemId = body.mensagem_id as string;
      if (!mensagemId) {
        return new Response(JSON.stringify({ error: "mensagem_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // fetch via user client to enforce tenant isolation via RLS
      const { data: msg, error: msgErr } = await userClient
        .from("mensagens")
        .select("id, tenant_id, conteudo, metadata, tipo")
        .eq("id", mensagemId)
        .maybeSingle();

      if (msgErr || !msg) {
        return new Response(JSON.stringify({ error: "Mensagem não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (msg.tipo !== "audio") {
        return new Response(JSON.stringify({ error: "Mensagem não é de áudio" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // reset attempts on manual retry
      const cleanMeta = { ...(msg.metadata || {}), transcricao_tentativas: 0, transcricao_erro: null };
      const idioma = await getIdiomaTenant(msg.tenant_id);
      const result = await processarMensagem({ id: msg.id, tenant_id: msg.tenant_id, conteudo: msg.conteudo, metadata: cleanMeta }, idioma);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- BATCH (cron) ----------
    const { data: pendentes, error: listErr } = await admin
      .from("mensagens")
      .select("id, tenant_id, conteudo, metadata")
      .eq("tipo", "audio")
      .filter("metadata->>transcricao_status", "eq", "pendente")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (listErr) throw listErr;
    if (!pendentes || pendentes.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];
    // resolve idioma por tenant (cache simples)
    const cacheIdioma = new Map<string, string>();
    for (const m of pendentes as MensagemRow[]) {
      let idioma = cacheIdioma.get(m.tenant_id);
      if (!idioma) {
        idioma = await getIdiomaTenant(m.tenant_id);
        cacheIdioma.set(m.tenant_id, idioma);
      }
      const r = await processarMensagem(m, idioma);
      results.push(r);
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("transcrever-audio error:", e);
    return new Response(JSON.stringify({ error: e?.message || "erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
