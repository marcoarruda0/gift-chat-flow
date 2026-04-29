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

    // Sanitize token: remove whitespace/newlines that may have been pasted by mistake
    const token = (cfg.page_access_token || "").replace(/\s+/g, "").trim();
    if (!token || token.length < 50 || !/^[A-Za-z0-9_\-]+$/.test(token)) {
      const prefix = token.slice(0, 6);
      const suffix = token.slice(-4);
      console.error(`Token inválido. len=${token.length} prefix=${prefix} suffix=${suffix}`);
      await serviceClient.from("instagram_config").update({
        status: "erro",
        ultimo_erro: `Token mal formatado (len=${token.length}). Cole novamente o Page Access Token de longa duração, sem espaços/quebras de linha.`,
      }).eq("tenant_id", profile.tenant_id);
      return new Response(JSON.stringify({
        error: "Token inválido ou mal formatado. Cole novamente o Page Access Token (sem espaços, quebras de linha ou aspas).",
        hint: "Use um Page Access Token de longa duração (60d) gerado no Graph API Explorer com permissões instagram_basic, instagram_manage_messages, pages_manage_metadata.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sep = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${sep}access_token=${encodeURIComponent(token)}`;
    console.log(`IG proxy → ${action || endpoint} | token prefix=${token.slice(0,6)} len=${token.length}`);

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
