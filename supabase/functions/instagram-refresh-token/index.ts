import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Refresh tokens that expire in less than 7 days (or have no expiry set)
  const limit = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: configs, error } = await supabase
    .from("instagram_config")
    .select("id, tenant_id, page_access_token, token_expires_at")
    .or(`token_expires_at.is.null,token_expires_at.lt.${limit}`);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const cfg of configs || []) {
    try {
      // Exchange long-lived page access token for a refreshed one
      const url = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${Deno.env.get("META_APP_ID") || ""}&client_secret=${Deno.env.get("META_APP_SECRET")}&fb_exchange_token=${encodeURIComponent(cfg.page_access_token)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || !json.access_token) {
        await supabase.from("instagram_config").update({
          status: "erro",
          ultimo_erro: `refresh failed: ${JSON.stringify(json).slice(0, 300)}`,
        }).eq("id", cfg.id);
        results.push({ id: cfg.id, ok: false, error: json });
        continue;
      }
      const expiresAt = json.expires_in
        ? new Date(Date.now() + json.expires_in * 1000).toISOString()
        : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("instagram_config").update({
        page_access_token: json.access_token,
        token_expires_at: expiresAt,
        ultima_verificacao_at: new Date().toISOString(),
        ultimo_erro: null,
      }).eq("id", cfg.id);
      results.push({ id: cfg.id, ok: true });
    } catch (err) {
      results.push({ id: cfg.id, ok: false, error: String(err) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
