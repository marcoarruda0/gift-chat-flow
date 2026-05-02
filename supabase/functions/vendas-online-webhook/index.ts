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

  const event: string = payload?.event || payload?.type || "unknown";
  const data = payload?.data || payload?.billing || payload;
  const billingId: string | undefined = data?.id || data?.billing?.id;
  const externalId: string | undefined =
    data?.externalId || data?.metadata?.externalId || data?.billing?.externalId;
  const status: string | undefined = data?.status || data?.billing?.status;

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
    let item: any = null;
    if (billingId) {
      const { data } = await admin
        .from("chamado_denis_itens")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("abacate_billing_id", billingId)
        .maybeSingle();
      item = data;
    }
    if (!item && externalId) {
      const { data } = await admin
        .from("chamado_denis_itens")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", externalId)
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

    const customer = data?.customer || data?.payer || data?.billing?.customer || {};
    const isPaid =
      event.toLowerCase().includes("paid") ||
      String(status || "").toUpperCase() === "PAID";
    const isRefund = event.toLowerCase().includes("refund");

    const patch: Record<string, unknown> = {};
    if (status) patch.abacate_status = String(status).toUpperCase();
    if (isPaid) {
      patch.abacate_status = "PAID";
      patch.status = "vendido";
      patch.pago_em = new Date().toISOString();
    }
    if (isRefund) {
      patch.abacate_status = "REFUNDED";
      patch.status = "disponivel";
    }
    if (customer?.name) patch.pagador_nome = String(customer.name);
    if (customer?.email) patch.pagador_email = String(customer.email);
    if (customer?.cellphone || customer?.phone)
      patch.pagador_cel = String(customer.cellphone || customer.phone);
    if (customer?.taxId || customer?.tax_id || customer?.document)
      patch.pagador_tax_id = String(customer.taxId || customer.tax_id || customer.document);

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
      .update({ erro: String(e?.message || e) })
      .eq("id", logRow!.id);
    return json({ error: "internal" }, 500);
  }
});
