import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles").select("tenant_id").eq("id", user.id).single();

    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "No tenant" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: cfg } = await serviceClient
      .from("instagram_config")
      .select("ig_user_id, page_id, page_access_token")
      .eq("tenant_id", profile.tenant_id)
      .maybeSingle();

    if (!cfg) {
      return new Response(JSON.stringify({ error: "Instagram não configurado para este tenant" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, endpoint, method = "GET", data } = body;

    let url: string;
    if (action === "test_connection") {
      url = `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.ig_user_id}?fields=username,name,profile_picture_url`;
    } else if (action === "subscribe_webhook") {
      url = `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.page_id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_reactions,message_reads`;
    } else if (action === "send_message") {
      url = `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.ig_user_id}/messages`;
    } else if (endpoint) {
      url = `https://graph.facebook.com/${GRAPH_VERSION}/${endpoint}`;
    } else {
      return new Response(JSON.stringify({ error: "action or endpoint required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const httpMethod = action === "subscribe_webhook" || action === "send_message" ? "POST" : method;

    const sep = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${sep}access_token=${encodeURIComponent(cfg.page_access_token)}`;

    const opts: RequestInit = {
      method: httpMethod,
      headers: { "Content-Type": "application/json" },
    };
    if (httpMethod !== "GET" && data) opts.body = JSON.stringify(data);

    const res = await fetch(fullUrl, opts);
    const responseData = await res.json();

    // Update status on test
    if (action === "test_connection") {
      if (res.ok) {
        await serviceClient.from("instagram_config").update({
          status: "conectado",
          ig_username: responseData.username || null,
          ultimo_erro: null,
          ultima_verificacao_at: new Date().toISOString(),
        }).eq("tenant_id", profile.tenant_id);
      } else {
        await serviceClient.from("instagram_config").update({
          status: "erro",
          ultimo_erro: JSON.stringify(responseData).slice(0, 500),
        }).eq("tenant_id", profile.tenant_id);
      }
    }

    return new Response(JSON.stringify(responseData), {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("instagram-proxy error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
