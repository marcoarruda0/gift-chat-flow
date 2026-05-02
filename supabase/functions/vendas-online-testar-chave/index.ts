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
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "missing_auth" }, 401);

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: userData, error: uerr } = await userClient.auth.getUser();
    if (uerr || !userData?.user) return json({ ok: false, message: "unauthorized" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return json({ ok: false, message: "no_tenant" }, 403);

    const { data: cfg } = await admin
      .from("vendas_online_config")
      .select("abacate_api_key")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const key = cfg?.abacate_api_key;
    if (!key) return json({ ok: false, message: "Chave de API não configurada." });

    const mode = key.startsWith("abc_dev_") ? "dev" : key.startsWith("abc_live_") ? "live" : "desconhecido";

    const ab = await fetch("https://api.abacatepay.com/v1/customer/list", {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = await ab.json().catch(() => ({}));

    if (!ab.ok || body?.error) {
      const msg =
        body?.error?.message ||
        (typeof body?.error === "string" ? body.error : null) ||
        body?.message ||
        `HTTP ${ab.status}`;
      return json({ ok: false, mode, message: msg });
    }

    return json({ ok: true, mode });
  } catch (e) {
    return json({ ok: false, message: String((e as any)?.message || e) }, 500);
  }
});
