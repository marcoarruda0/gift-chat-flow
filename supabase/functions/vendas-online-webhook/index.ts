import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const secretParam = url.searchParams.get("webhookSecret") || "";
  const [tenantId, secret] = secretParam.split(":");
  if (!tenantId || !secret) return json({ error: "invalid_secret" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: cfg } = await admin
    .from("vendas_online_config")
    .select("webhook_secret")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!cfg?.webhook_secret || cfg.webhook_secret !== secret) {
    return json({ error: "forbidden" }, 403);
  }

  const raw = await req.text();
  let payload: any = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // ---- Parse payload v2 ----
  // { event, apiVersion: 2, data: { checkout: {...}, customer: {...}, payerInformation: {...} } }
  const event: string = payload?.event || payload?.type || "unknown";
  const data = payload?.data ?? {};
  const checkout = data?.checkout ?? data?.billing ?? data ?? {};
  const customer = data?.customer ?? checkout?.customer ?? {};
  const payerInformation = data?.payerInformation ?? {};

  const billingId: string | undefined = checkout?.id;
  const externalId: string | undefined =
    checkout?.externalId ||
    checkout?.metadata?.itemId ||
    data?.externalId;
  const metadata = checkout?.metadata ?? data?.metadata ?? {};
  const metaTenantId: string | undefined = metadata?.tenantId;
  const metaItemId: string | undefined = metadata?.itemId;
  const status: string | undefined = checkout?.status;

  if (metaTenantId && metaTenantId !== tenantId) {
    await admin.from("vendas_online_webhook_log").insert({
      tenant_id: tenantId, event, billing_id: billingId, payload, erro: "tenant_mismatch",
    });
    return json({ error: "tenant_mismatch" }, 403);
  }

  // dedup
  if (billingId) {
    const { data: dup } = await admin
      .from("vendas_online_webhook_log")
      .select("id")
      .eq("billing_id", billingId)
      .eq("event", event)
      .eq("processado", true)
      .maybeSingle();
    if (dup) {
      return json({ ok: true, deduped: true });
    }
  }

  const { data: logRow } = await admin
    .from("vendas_online_webhook_log")
    .insert({ tenant_id: tenantId, event, billing_id: billingId, payload })
    .select("id")
    .single();

  try {
    // ---- Localizar o item ----
    let item: any = null;

    // 1) por metadata.itemId
    if (metaItemId) {
      const { data } = await admin
        .from("chamado_denis_itens")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", metaItemId)
        .maybeSingle();
      item = data;
    }
    // 2) por externalId (= item.id)
    if (!item && externalId) {
      const { data } = await admin
        .from("chamado_denis_itens")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", externalId)
        .maybeSingle();
      item = data;
    }
    // 3) por billing id já gravado
    if (!item && billingId) {
      const { data } = await admin
        .from("chamado_denis_itens")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("abacate_billing_id", billingId)
        .maybeSingle();
      item = data;
    }

    if (!item) {
      await admin
        .from("vendas_online_webhook_log")
        .update({ erro: "item_not_found" })
        .eq("id", logRow!.id);
      return json({ ok: true, warning: "item_not_found" });
    }

    // ---- Mapear evento ----
    const evt = String(event || "").toLowerCase();
    const statusUpper = String(status || "").toUpperCase();
    const isCompleted =
      evt.includes("completed") ||
      evt.includes("paid") ||
      evt === "billing.paid" ||
      statusUpper === "PAID";
    const isRefund = evt.includes("refund") || statusUpper === "REFUNDED";
    const isDispute = evt.includes("dispute");

    const patch: Record<string, unknown> = {};
    if (status) patch.abacate_status = String(status).toUpperCase();
    if (isCompleted) {
      patch.abacate_status = "PAID";
      patch.status = "vendido";
      patch.pago_em = new Date().toISOString();
    }
    if (isRefund) {
      patch.abacate_status = "REFUNDED";
      patch.status = "disponivel";
    }
    if (isDispute) {
      patch.abacate_status = "DISPUTED";
    }

    // ---- Dados do pagador (v2: data.customer + payerInformation) ----
    const payerByMethod =
      payerInformation?.PIX || payerInformation?.CARD || payerInformation?.BOLETO || {};

    const pagadorNome =
      customer?.name ||
      payerByMethod?.name ||
      null;
    const pagadorEmail =
      customer?.email ||
      payerByMethod?.email ||
      null;
    const pagadorTaxId =
      customer?.taxId ||
      customer?.tax_id ||
      payerByMethod?.taxId ||
      null;
    const pagadorCel =
      customer?.cellphone ||
      customer?.phone ||
      payerByMethod?.cellphone ||
      payerByMethod?.phone ||
      null;

    if (pagadorNome) patch.pagador_nome = String(pagadorNome);
    if (pagadorEmail) patch.pagador_email = String(pagadorEmail);
    if (pagadorTaxId) patch.pagador_tax_id = String(pagadorTaxId);
    if (pagadorCel) patch.pagador_cel = String(pagadorCel);

    if (Object.keys(patch).length > 0) {
      await admin.from("chamado_denis_itens").update(patch).eq("id", item.id);
    }

    await admin
      .from("vendas_online_webhook_log")
      .update({ processado: true })
      .eq("id", logRow!.id);

    return json({ ok: true });
  } catch (e) {
    console.error("webhook error", e);
    await admin
      .from("vendas_online_webhook_log")
      .update({ erro: String((e as any)?.message || e) })
      .eq("id", logRow!.id);
    return json({ error: "internal" }, 500);
  }
});
