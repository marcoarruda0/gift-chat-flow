import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "No tenant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = profile.tenant_id;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: cloudConfig } = await serviceClient
      .from("whatsapp_cloud_config")
      .select("phone_number_id, waba_id, access_token")
      .eq("tenant_id", tenantId)
      .single();

    if (!cloudConfig) {
      return new Response(
        JSON.stringify({ error: "WhatsApp Cloud não configurado para este tenant" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();
    const { endpoint, method = "POST", data, useWabaId = false } = body;

    if (!endpoint) {
      return new Response(JSON.stringify({ error: "endpoint is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // useWabaId: para chamadas como `message_templates` que vão em /{waba_id}/...
    const baseId = useWabaId ? cloudConfig.waba_id : cloudConfig.phone_number_id;
    const graphUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${baseId}/${endpoint}`;

    // Multipart upload (media): client passes { _multipart: true, file_base64, mime_type, filename }
    if (data?._multipart) {
      const { file_base64, mime_type, filename } = data;
      if (!file_base64 || !mime_type) {
        return new Response(
          JSON.stringify({ error: "file_base64 and mime_type required for multipart upload" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Decode base64 to bytes
      const binary = atob(file_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const formData = new FormData();
      formData.append("messaging_product", "whatsapp");
      formData.append("type", mime_type);
      formData.append("file", new Blob([bytes], { type: mime_type }), filename || "upload");

      const uploadRes = await fetch(graphUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${cloudConfig.access_token}` },
        body: formData,
      });
      const uploadData = await uploadRes.json();
      return new Response(JSON.stringify(uploadData), {
        status: uploadRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cloudConfig.access_token}`,
      },
    };

    if (method !== "GET" && data) {
      fetchOptions.body = JSON.stringify(data);
    }

    const graphRes = await fetch(graphUrl, fetchOptions);
    const responseData = await graphRes.json();

    return new Response(JSON.stringify(responseData), {
      status: graphRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("whatsapp-cloud-proxy error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
