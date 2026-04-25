import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "missing_auth" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate user via JWT
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "invalid_user" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const eventoId: string | undefined = body.evento_id;
    const ultimo: boolean = !!body.ultimo;
    if (!eventoId && !ultimo) {
      return json({ error: "missing_evento_id_or_ultimo" }, 400);
    }

    const service = createClient(supabaseUrl, serviceKey);

    // Resolve user tenant
    const { data: profile } = await service
      .from("profiles")
      .select("tenant_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.tenant_id) {
      return json({ error: "no_tenant" }, 403);
    }

    // Fetch event (must belong to tenant)
    let query = service
      .from("whatsapp_webhook_eventos")
      .select("id, payload, tenant_id, phone_number_id")
      .eq("tenant_id", profile.tenant_id);
    if (eventoId) {
      query = query.eq("id", eventoId);
    } else {
      query = query.order("recebido_at", { ascending: false }).limit(1);
    }
    const { data: evento, error: evErr } = await query.maybeSingle();
    if (evErr || !evento) {
      return json({ error: "event_not_found" }, 404);
    }

    // Re-process via shared logic: re-POST to webhook endpoint
    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-cloud-webhook`;
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evento.payload),
    });

    await service
      .from("whatsapp_webhook_eventos")
      .update({ reprocessado_em: new Date().toISOString() })
      .eq("id", evento.id);

    return json({ ok: true, evento_id: evento.id, webhook_status: resp.status });
  } catch (e) {
    console.error("[whatsapp-cloud-reprocessar] failed", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
