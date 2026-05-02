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

async function callAbacate(
  path: string,
  apiKey: string,
  init: RequestInit = {},
) {
  const res = await fetch(`${ABACATE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const rawBody = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(rawBody); } catch { /* noop */ }
  return { status: res.status, ok: res.ok, parsed, rawBody };
}

function abacateErrorMessage(status: number, parsed: any): string {
  const apiMsg =
    parsed?.error?.message ||
    (typeof parsed?.error === "string" ? parsed.error : null) ||
    parsed?.message ||
    null;

  if (status === 401 || status === 403) {
    return "Chave API inválida ou sem permissão na AbacatePay.";
  }
  if (status === 404) {
    return apiMsg ? `AbacatePay (404): ${apiMsg}` : "Recurso não encontrado na AbacatePay (404).";
  }
  if (status === 422) {
    return apiMsg ? `Validação AbacatePay: ${apiMsg}` : "Payload rejeitado pela AbacatePay (422).";
  }
  if (status >= 500) {
    return "AbacatePay está indisponível no momento. Tente novamente.";
  }
  return apiMsg ? `AbacatePay: ${apiMsg}` : `Falha na AbacatePay (HTTP ${status}).`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing_auth", message: "Sessão expirada ou requisição não autenticada." }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: userData, error: uerr } = await userClient.auth.getUser();
    if (uerr || !userData?.user) {
      return json({ error: "unauthorized", message: "Sessão inválida. Faça login novamente." }, 401);
    }
    const userId = userData.user.id;

    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return json({ error: "no_tenant", message: "Nenhuma empresa vinculada ao seu usuário." }, 403);

    const body = await req.json().catch(() => ({}));
    const itemId: string | undefined = body?.item_id;
    if (!itemId) return json({ error: "item_id_required", message: "Item não informado." }, 400);

    const { data: item, error: ierr } = await admin
      .from("chamado_denis_itens")
      .select("*")
      .eq("id", itemId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (ierr || !item) return json({ error: "item_not_found", message: "Item não encontrado." }, 404);

    if (item.abacate_status === "PAID") {
      return json({ error: "already_paid", message: "Este item já foi pago.", url: item.abacate_url });
    }
    if (item.abacate_url && item.abacate_status === "PENDING") {
      return json({ url: item.abacate_url, billing_id: item.abacate_billing_id, reused: true });
    }

    const valorCents = Math.round(Number(item.valor || 0) * 100);
    if (valorCents <= 0) return json({ error: "invalid_value", message: "Valor do item inválido." }, 400);

    const { data: cfg } = await admin
      .from("vendas_online_config")
      .select("abacate_api_key")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!cfg?.abacate_api_key) {
      return json({ error: "abacate_not_configured", message: "Chave de API da AbacatePay não configurada." }, 400);
    }
    const apiKey = cfg.abacate_api_key as string;

    // ---- 1) Garantir produto na AbacatePay ----
    let productId: string | null = item.abacate_product_id || null;
    const productExternalId =
      item.abacate_product_external_id || `item-${item.id}`;

    if (!productId) {
      const productPayload = {
        externalId: productExternalId,
        name: (item.descricao && String(item.descricao).trim().length > 0)
          ? String(item.descricao).slice(0, 120)
          : `Item #${item.numero}`,
        description: `Venda Online — Item #${item.numero}`,
        price: valorCents,
        currency: "BRL",
      };

      const pr = await callAbacate("/products/create", apiKey, {
        method: "POST",
        body: JSON.stringify(productPayload),
      });

      if (!pr.ok || pr.parsed?.error) {
        console.error("abacate product error", pr.status, pr.rawBody);
        return json({
          error: "abacate_error",
          stage: "product_create",
          message: abacateErrorMessage(pr.status, pr.parsed),
          httpStatus: pr.status,
          errorPayload: pr.parsed ?? undefined,
          rawBody: pr.parsed ? undefined : pr.rawBody?.slice(0, 500),
        }, 200);
      }

      productId = pr.parsed?.data?.id || pr.parsed?.id || null;
      if (!productId) {
        return json({
          error: "abacate_invalid_response",
          stage: "product_create",
          message: "AbacatePay não retornou o id do produto.",
          httpStatus: pr.status,
          errorPayload: pr.parsed ?? undefined,
        }, 200);
      }

      await admin
        .from("chamado_denis_itens")
        .update({
          abacate_product_id: productId,
          abacate_product_external_id: productExternalId,
        })
        .eq("id", item.id);
    }

    // ---- 2) Criar checkout v2 ----
    const projectRef = SUPABASE_URL.replace("https://", "").split(".")[0];
    const completionUrl = `https://${projectRef}.supabase.co`;

    const checkoutPayload = {
      items: [{ id: productId, quantity: 1 }],
      methods: ["PIX"],
      externalId: String(item.id),
      returnUrl: completionUrl,
      completionUrl: completionUrl,
      metadata: {
        tenantId: tenantId,
        itemId: item.id,
      },
    };

    const ck = await callAbacate("/checkouts/create", apiKey, {
      method: "POST",
      body: JSON.stringify(checkoutPayload),
    });

    if (!ck.ok || ck.parsed?.error) {
      console.error("abacate checkout error", ck.status, ck.rawBody);
      return json({
        error: "abacate_error",
        stage: "checkout_create",
        message: abacateErrorMessage(ck.status, ck.parsed),
        httpStatus: ck.status,
        errorPayload: ck.parsed ?? undefined,
        rawBody: ck.parsed ? undefined : ck.rawBody?.slice(0, 500),
      }, 200);
    }

    const checkout = ck.parsed?.data ?? ck.parsed;
    const billingId: string | undefined = checkout?.id;
    const url: string | undefined = checkout?.url;
    const status: string = checkout?.status || "PENDING";
    if (!billingId || !url) {
      return json({
        error: "abacate_invalid_response",
        stage: "checkout_create",
        message: "AbacatePay não retornou id/url do checkout.",
        httpStatus: ck.status,
        errorPayload: ck.parsed ?? undefined,
      }, 200);
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
    return json({
      error: "internal",
      message: "Erro inesperado: " + String((e as any)?.message || e),
    }, 500);
  }
});
