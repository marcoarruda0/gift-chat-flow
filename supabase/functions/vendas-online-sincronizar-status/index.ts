import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ABACATE_BASE = "https://api.abacatepay.com/v2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callAbacate(path: string, apiKey: string) {
  const res = await fetch(`${ABACATE_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  const rawBody = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(rawBody); } catch { /* noop */ }
  return { status: res.status, ok: res.ok, parsed, rawBody };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing_auth", message: "Sessão expirada." }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: userData, error: uerr } = await userClient.auth.getUser();
    if (uerr || !userData?.user) {
      return json({ error: "unauthorized", message: "Sessão inválida." }, 401);
    }
    const userId = userData.user.id;

    const { data: profile } = await admin
      .from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return json({ error: "no_tenant", message: "Sem tenant." }, 403);

    const body = await req.json().catch(() => ({}));
    const itemId: string | undefined = body?.item_id;
    if (!itemId) return json({ error: "item_id_required", message: "Item não informado." }, 400);

    const { data: item } = await admin
      .from("chamado_denis_itens")
      .select("*")
      .eq("id", itemId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!item) return json({ error: "item_not_found", message: "Item não encontrado." }, 404);

    if (!item.abacate_billing_id) {
      return json({ error: "no_billing", message: "Este item ainda não tem link gerado." }, 400);
    }

    const { data: cfg } = await admin
      .from("vendas_online_config")
      .select("abacate_api_key")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!cfg?.abacate_api_key) {
      return json({ error: "abacate_not_configured", message: "Chave AbacatePay não configurada." }, 400);
    }
    const apiKey = cfg.abacate_api_key as string;

    // A v2 usa o mesmo id (bill_xxx) tanto para billing quanto para checkout.
    // Tentamos billing/get; se falhar 404, tentamos checkouts/get.
    let resp = await callAbacate(`/billing/get?id=${encodeURIComponent(item.abacate_billing_id)}`, apiKey);
    let source = "billing";
    if (resp.status === 404) {
      resp = await callAbacate(`/checkouts/get?id=${encodeURIComponent(item.abacate_billing_id)}`, apiKey);
      source = "checkout";
    }

    if (!resp.ok || resp.parsed?.error) {
      return json({
        error: "abacate_error",
        message: resp.parsed?.error?.message || resp.parsed?.message || `Falha (HTTP ${resp.status}).`,
        httpStatus: resp.status,
        errorPayload: resp.parsed,
      }, 200);
    }

    const data = resp.parsed?.data ?? resp.parsed ?? {};
    const status: string = String(data?.status || "").toUpperCase();
    const customer = data?.customer ?? {};
    const payerInformation = data?.payerInformation ?? {};
    const payerByMethod =
      payerInformation?.PIX || payerInformation?.CARD || payerInformation?.BOLETO || {};

    const patch: Record<string, unknown> = {};
    if (status) patch.abacate_status = status;
    if (status === "PAID") {
      patch.status = "vendido";
      patch.pago_em = item.pago_em || new Date().toISOString();
    } else if (status === "REFUNDED") {
      patch.status = "disponivel";
    }

    const pagadorNome = customer?.name || payerByMethod?.name || null;
    const pagadorEmail = customer?.email || payerByMethod?.email || null;
    const pagadorTaxId = customer?.taxId || customer?.tax_id || payerByMethod?.taxId || null;
    const pagadorCel = customer?.cellphone || customer?.phone || payerByMethod?.cellphone || payerByMethod?.phone || null;

    if (pagadorNome) patch.pagador_nome = String(pagadorNome);
    if (pagadorEmail) patch.pagador_email = String(pagadorEmail);
    if (pagadorTaxId) patch.pagador_tax_id = String(pagadorTaxId);
    if (pagadorCel) patch.pagador_cel = String(pagadorCel);

    if (Object.keys(patch).length > 0) {
      await admin.from("chamado_denis_itens").update(patch).eq("id", item.id);
    }

    return json({
      ok: true,
      source,
      status,
      updated: Object.keys(patch),
    });
  } catch (e) {
    console.error("sincronizar-status exception", e);
    return json({
      error: "internal",
      message: "Erro inesperado: " + String((e as any)?.message || e),
    }, 500);
  }
});
