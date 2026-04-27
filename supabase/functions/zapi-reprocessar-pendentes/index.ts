import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "missing_auth" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: userResp, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userResp?.user) return json({ error: "unauthorized" }, 401);
    const userId = userResp.user.id;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await supabase
      .from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) return json({ error: "no_tenant" }, 403);

    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles || []).some(
      (r: any) => r.role === "admin_tenant" || r.role === "admin_master",
    );
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const limit = Math.min(Math.max(Number(body?.limit) || 10, 1), 50);

    const { data: eventos, error: evErr } = await supabase
      .from("zapi_webhook_eventos")
      .select("id, instance_id, payload, processed, error_msg")
      .eq("tenant_id", tenantId)
      .or("processed.eq.false,error_msg.not.is.null")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (evErr) return json({ error: evErr.message }, 500);
    if (!eventos || eventos.length === 0) {
      return json({
        ok: true, reprocessed: 0, inserted: 0, skipped: 0, errors: 0,
        message: "nenhum_pendente",
      });
    }

    // Reprocessa via HTTP do próprio webhook (que está com verify_jwt=false).
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/zapi-webhook`;

    let inserted = 0, skipped = 0, errors = 0;
    const details: any[] = [];

    for (const ev of eventos) {
      try {
        const r = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ev.payload),
        });
        const result = await r.json().catch(() => ({}));
        const action = result?.action;
        if (action === "inserted" || action === "echo_attached") inserted++;
        else if (result?.ok) skipped++;
        else errors++;
        // marca o evento original como processado para não voltar à fila
        await supabase.from("zapi_webhook_eventos").update({
          processed: true,
          processed_at: new Date().toISOString(),
          resultado: result,
          error_msg: result?.error || null,
        }).eq("id", ev.id);
        details.push({ id: ev.id, status: r.status, ...result });
      } catch (e: any) {
        errors++;
        await supabase.from("zapi_webhook_eventos").update({
          error_msg: String(e?.message || e),
        }).eq("id", ev.id);
        details.push({ id: ev.id, ok: false, error: String(e?.message || e) });
      }
    }

    return json({
      ok: true, reprocessed: eventos.length, inserted, skipped, errors, details,
    });
  } catch (e: any) {
    console.error("[zapi-reproc] error:", e);
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
