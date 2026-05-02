import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Diag = {
  ok: boolean;
  message: string;
  mode?: string;
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

function traduzir(code: string, fallback?: string): string {
  const map: Record<string, string> = {
    missing_auth: "Sessão expirada ou requisição não autenticada.",
    unauthorized: "Sessão inválida. Faça login novamente.",
    no_tenant: "Nenhuma empresa (tenant) vinculada ao seu usuário.",
    abacate_not_configured: "Chave de API não configurada.",
    invalid_key_format: "Formato de chave inválido. Use uma chave abc_dev_… ou abc_live_…",
  };
  return map[code] || fallback || code;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ ok: false, message: traduzir("missing_auth") }, 200);
    }

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: userData, error: uerr } = await userClient.auth.getUser();
    if (uerr || !userData?.user) {
      return json({ ok: false, message: traduzir("unauthorized") }, 200);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return json({ ok: false, message: traduzir("no_tenant") }, 200);

    const { data: cfg } = await admin
      .from("vendas_online_config")
      .select("abacate_api_key")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const key = cfg?.abacate_api_key;
    if (!key) return json({ ok: false, message: traduzir("abacate_not_configured") }, 200);

    const mode = key.startsWith("abc_dev_")
      ? "dev"
      : key.startsWith("abc_live_")
      ? "live"
      : "desconhecido";

    const ab = await fetch("https://api.abacatepay.com/v1/customer/list", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });

    const rawBody = await ab.text();
    let body: any = null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = null;
    }

    if (!ab.ok || body?.error) {
      const apiMsg =
        body?.error?.message ||
        (typeof body?.error === "string" ? body.error : null) ||
        body?.message ||
        null;

      let message: string;
      if (ab.status === 401 || ab.status === 403) {
        message = "Chave API inválida ou sem permissão na AbacatePay.";
      } else if (ab.status === 404) {
        message = "Endpoint não encontrado na AbacatePay (verifique se a chave é v1).";
      } else if (ab.status >= 500) {
        message = "AbacatePay está indisponível no momento. Tente novamente.";
      } else {
        message = apiMsg ? `AbacatePay: ${apiMsg}` : `Falha ao validar chave (HTTP ${ab.status}).`;
      }

      return json({
        ok: false,
        mode,
        message,
        httpStatus: ab.status,
        errorPayload: body ?? undefined,
        rawBody: body ? undefined : rawBody?.slice(0, 500),
      }, 200);
    }

    return json({
      ok: true,
      mode,
      message: `Chave válida (modo ${mode}).`,
      httpStatus: ab.status,
    }, 200);
  } catch (e) {
    return json({
      ok: false,
      message: "Erro inesperado ao testar a chave: " + String((e as any)?.message || e),
    }, 200);
  }
});
