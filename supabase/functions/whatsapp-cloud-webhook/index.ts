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

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // GET → Meta verification handshake
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    console.log("[whatsapp-cloud-webhook] GET verify", { mode, hasToken: !!token });

    if (mode !== "subscribe" || !token) {
      return new Response("Bad Request", { status: 400 });
    }

    const { data: match } = await serviceClient
      .from("whatsapp_cloud_config")
      .select("id")
      .eq("verify_token", token)
      .maybeSingle();

    if (match) {
      console.log("[whatsapp-cloud-webhook] verify token matched, returning challenge");
      return new Response(challenge ?? "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    console.warn("[whatsapp-cloud-webhook] verify token did NOT match any tenant");
    return new Response("Forbidden", { status: 403 });
  }

  // POST → incoming events from Meta
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log(
        "[whatsapp-cloud-webhook] POST event:",
        JSON.stringify(body, null, 2)
      );
      // Phase 1: just log. Integration with conversas/mensagens comes later.
    } catch (e) {
      console.error("[whatsapp-cloud-webhook] failed to parse body", e);
    }
    return new Response("ok", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
});
