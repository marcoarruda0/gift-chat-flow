import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing_auth" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: userData, error: uerr } = await userClient.auth.getUser();
    if (uerr || !userData?.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return json({ error: "no_tenant" }, 403);

    const body = await req.json().catch(() => ({}));
    const itemId: string | undefined = body?.item_id;
    if (!itemId) return json({ error: "item_id_required" }, 400);

    const { data: item, error: ierr } = await admin
      .from("chamado_denis_itens")
      .select("*")
      .eq("id", itemId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (ierr || !item) return json({ error: "item_not_found" }, 404);

    if (item.abacate_status === "PAID") {
      return json({ error: "already_paid", url: item.abacate_url });
    }
    if (item.abacate_url && item.abacate_status === "PENDING") {
      return json({ url: item.abacate_url, billing_id: item.abacate_billing_id, reused: true });
    }

    const valorCents = Math.round(Number(item.valor || 0) * 100);
    if (valorCents <= 0) return json({ error: "invalid_value" }, 400);

    const { data: cfg } = await admin
      .from("vendas_online_config")
      .select("abacate_api_key, dev_mode")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!cfg?.abacate_api_key) {
      return json({ error: "abacate_not_configured" }, 400);
    }

    const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];
    const completionUrl = `https://${projectRef}.supabase.co`;

    const payload = {
      frequency: "ONE_TIME",
      methods: ["PIX"],
      products: [
        {
          name: `Item #${item.numero}`,
          description: (item.descricao || "Venda Online").slice(0, 200),
          quantity: 1,
          price: valorCents,
        },
      ],
      returnUrl: completionUrl,
      completionUrl: completionUrl,
      metadata: {
        externalId: item.id,
        tenantId: tenantId,
      },
    };

    const ab = await fetch("https://api.abacatepay.com/v1/billing/create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.abacate_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const abJson = await ab.json().catch(() => ({}));
    if (!ab.ok || abJson?.error) {
      console.error("abacate error", ab.status, abJson);
      return json({ error: "abacate_error", details: abJson }, 502);
    }

    const billing = abJson?.data ?? abJson;
    const billingId: string | undefined = billing?.id;
    const url: string | undefined = billing?.url;
    const status: string = billing?.status || "PENDING";
    if (!billingId || !url) {
      return json({ error: "abacate_invalid_response", details: abJson }, 502);
    }

    await admin
      .from("chamado_denis_itens")
      .update({
        abacate_billing_id: billingId,
        abacate_url: url,
        abacate_status: status,
      })
      .eq("id", item.id);

    return json({ url, billing_id: billingId, status });
  } catch (e) {
    console.error("criar-link exception", e);
    return json({ error: String(e?.message || e) }, 500);
  }
});
