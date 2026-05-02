import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function uuid() {
  return crypto.randomUUID();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) return json({ error: "unauthorized" }, 401);

  const userId = claimsData.claims.sub as string;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: profile } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const tenantId = profile?.tenant_id as string | undefined;
  if (!tenantId) return json({ error: "no_tenant" }, 403);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const event = String(body?.event || "billing.paid");
  if (!["billing.paid", "billing.refunded"].includes(event)) {
    return json({ error: "invalid_event", message: "event deve ser billing.paid ou billing.refunded" }, 400);
  }

  const { data: cfg } = await admin
    .from("vendas_online_config")
    .select("webhook_secret")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const secret = cfg?.webhook_secret;
  if (!secret) {
    return json({
      ok: false,
      message:
        "Webhook secret não configurado. Gere e salve o secret antes de testar.",
    }, 400);
  }

  const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];
  const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/vendas-online-webhook?webhookSecret=${tenantId}:${secret}`;

  const status = event === "billing.paid" ? "PAID" : "REFUNDED";
  const billingId = `bill_test_${uuid().replace(/-/g, "").slice(0, 16)}`;
  const fakeItemId = `test-${uuid()}`;

  const sentPayload = {
    event,
    apiVersion: 2,
    devMode: true,
    data: {
      billing: {
        id: billingId,
        status,
        amount: 1000,
        externalId: fakeItemId,
        metadata: { tenantId, itemId: fakeItemId, test: true },
      },
      customer: {
        name: "Teste Webhook",
        email: "teste@exemplo.com",
        taxId: "00000000000",
        cellphone: "+5511999999999",
      },
      payerInformation: {
        PIX: {
          name: "Teste Webhook",
          email: "teste@exemplo.com",
          taxId: "00000000000",
        },
      },
    },
  };

  const startedAt = Date.now();
  let httpStatus = 0;
  let responseBody: unknown = null;
  let rawText = "";
  let networkError: string | null = null;
  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sentPayload),
    });
    httpStatus = r.status;
    rawText = await r.text();
    try {
      responseBody = JSON.parse(rawText);
    } catch {
      responseBody = rawText;
    }
  } catch (e) {
    networkError = String((e as any)?.message || e);
  }
  const elapsedMs = Date.now() - startedAt;

  const ok = !networkError && httpStatus >= 200 && httpStatus < 300;
  const message = networkError
    ? `Erro de rede: ${networkError}`
    : ok
      ? `Webhook respondeu com sucesso (HTTP ${httpStatus}) em ${elapsedMs}ms.`
      : `Webhook retornou HTTP ${httpStatus}. Veja os detalhes abaixo.`;

  return json({
    ok,
    message,
    httpStatus,
    elapsedMs,
    webhookUrl: webhookUrl.replace(secret, "****"),
    sentPayload,
    responseBody,
    networkError,
  });
});
