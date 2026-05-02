import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ABACATE_BASE = "https://api.abacatepay.com/v2";

type Diag = {
  ok: boolean;
  message: string;
  mode?: string;
  apiVersion?: number;
  httpStatus?: number;
  errorPayload?: unknown;
  rawBody?: string;
};

function json(body: Diag, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ ok: false, message: "Sessão expirada ou requisição não autenticada." }, 200);
    }

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: userData, error: uerr } = await userClient.auth.getUser();
    if (uerr || !userData?.user) {
      return json({ ok: false, message: "Sessão inválida. Faça login novamente." }, 200);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) {
      return json({ ok: false, message: "Nenhuma empresa vinculada ao seu usuário." }, 200);
    }

    const { data: cfg } = await admin
      .from("vendas_online_config")
      .select("abacate_api_key")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const key = cfg?.abacate_api_key;
    if (!key) {
      return json({ ok: false, message: "Chave de API não configurada." }, 200);
    }

    const mode = key.startsWith("abc_dev_")
      ? "dev"
      : key.startsWith("abc_live_")
      ? "live"
      : "desconhecido";

    // Endpoint leve de validação na v2: tenta criar um checkout com payload
    // claramente inválido. Se a chave está OK mas o payload é inválido,
    // a AbacatePay devolve 4xx com erro de validação (≠ 401/403). Isso
    // confirma autenticação sem precisar criar nada de verdade.
    //
    // Estratégia: GET em rota de listagem/me se existir; senão, ping de auth.
    // A v2 documenta /v2/checkouts/create (POST) — usamos OPTIONS/HEAD com
    // GET simples num path inexistente para validar só o auth header.
    const ab = await fetch(`${ABACATE_BASE}/checkouts/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const rawBody = await ab.text();
    let body: any = null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = null;
    }

    const apiMsg =
      body?.error?.message ||
      (typeof body?.error === "string" ? body.error : null) ||
      body?.message ||
      null;

    // 401/403 => chave inválida
    if (ab.status === 401 || ab.status === 403) {
      return json({
        ok: false,
        mode,
        apiVersion: 2,
        message: "Chave API v2 inválida ou sem permissão na AbacatePay.",
        httpStatus: ab.status,
        errorPayload: body ?? undefined,
        rawBody: body ? undefined : rawBody?.slice(0, 500),
      }, 200);
    }

    // 400/422 => chave OK, payload rejeitado (esperado, é só um ping)
    if (ab.status === 400 || ab.status === 422) {
      return json({
        ok: true,
        mode,
        apiVersion: 2,
        message: `Chave v2 válida (modo ${mode}).`,
        httpStatus: ab.status,
      }, 200);
    }

    // 2xx => também válido
    if (ab.ok) {
      return json({
        ok: true,
        mode,
        apiVersion: 2,
        message: `Chave v2 válida (modo ${mode}).`,
        httpStatus: ab.status,
      }, 200);
    }

    // 404 => endpoint mudou ou chave é da v1
    if (ab.status === 404) {
      return json({
        ok: false,
        mode,
        apiVersion: 2,
        message: "Endpoint v2 não encontrado. Verifique se a chave gerada é compatível com a API v2 da AbacatePay.",
        httpStatus: ab.status,
        errorPayload: body ?? undefined,
        rawBody: body ? undefined : rawBody?.slice(0, 500),
      }, 200);
    }

    if (ab.status >= 500) {
      return json({
        ok: false,
        mode,
        apiVersion: 2,
        message: "AbacatePay está indisponível no momento. Tente novamente.",
        httpStatus: ab.status,
        errorPayload: body ?? undefined,
        rawBody: body ? undefined : rawBody?.slice(0, 500),
      }, 200);
    }

    return json({
      ok: false,
      mode,
      apiVersion: 2,
      message: apiMsg ? `AbacatePay: ${apiMsg}` : `Resposta inesperada (HTTP ${ab.status}).`,
      httpStatus: ab.status,
      errorPayload: body ?? undefined,
      rawBody: body ? undefined : rawBody?.slice(0, 500),
    }, 200);
  } catch (e) {
    return json({
      ok: false,
      message: "Erro inesperado ao testar a chave: " + String((e as any)?.message || e),
    }, 200);
  }
});
