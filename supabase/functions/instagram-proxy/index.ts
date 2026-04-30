import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";

const REQUIRED_PERMISSIONS = [
  "instagram_basic",
  "instagram_manage_messages",
  "pages_manage_metadata",
  "pages_show_list",
];
const OPTIONAL_PERMISSIONS = ["pages_messaging"];

interface TokenValidation {
  ok: boolean;
  cleaned: string;
  error?: string;
}

function validateToken(raw: string): TokenValidation {
  const cleaned = (raw || "").replace(/[\s"'`]+/g, "").trim();
  if (!cleaned) return { ok: false, cleaned, error: "Token vazio." };
  if (!/^[A-Za-z0-9_-]+$/.test(cleaned)) {
    return { ok: false, cleaned, error: "Token contém caracteres inválidos (espaços/aspas/símbolos). Cole apenas o valor do Page Access Token." };
  }
  if (cleaned.length < 100) {
    return { ok: false, cleaned, error: `Token muito curto (${cleaned.length} chars). Use um Page Access Token de longa duração (~180+ chars).` };
  }
  return { ok: true, cleaned };
}

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

    const body = await req.json();
    const { action, endpoint, method = "GET", data, draft } = body;

    const { data: savedCfg } = await serviceClient
      .from("instagram_config")
      .select("ig_user_id, page_id, page_access_token")
      .eq("tenant_id", profile.tenant_id)
      .maybeSingle();

    // For test_token, allow draft credentials from body (pre-save validation)
    const cfg = (action === "test_token" && draft)
      ? {
          ig_user_id: draft.ig_user_id || savedCfg?.ig_user_id || "",
          page_id: draft.page_id || savedCfg?.page_id || "",
          page_access_token: draft.page_access_token || savedCfg?.page_access_token || "",
        }
      : savedCfg;

    if (!cfg) {
      return new Response(JSON.stringify({ error: "Instagram não configurado para este tenant" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate token first for ALL actions
    const tokenCheck = validateToken(cfg.page_access_token || "");
    if (!tokenCheck.ok) {
      console.error(`Token inválido. ${tokenCheck.error}`);
      await serviceClient.from("instagram_config").update({
        status: "erro",
        ultimo_erro: tokenCheck.error,
        ultima_verificacao_at: new Date().toISOString(),
      }).eq("tenant_id", profile.tenant_id);
      return new Response(JSON.stringify({
        ok: false,
        error: tokenCheck.error,
        hint: "Gere um Page Access Token de longa duração (60d) no Graph API Explorer com permissões instagram_basic, instagram_manage_messages, pages_manage_metadata, pages_show_list.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = tokenCheck.cleaned;

    // ============ NEW ACTION: test_token ============
    if (action === "test_token") {
      const errors: string[] = [];
      let tokenValid = false;
      let igAccountValid = false;
      let igUsername: string | null = null;
      let granted: string[] = [];
      let declined: string[] = [];
      let missing: string[] = [];

      // 1. /me - validates token is parseable
      try {
        const meRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
        const meJson = await meRes.json();
        if (!meRes.ok || meJson.error) {
          errors.push(`Token inválido na Meta: ${meJson.error?.message || meRes.statusText}`);
        } else {
          tokenValid = true;
        }
      } catch (e) {
        errors.push(`Erro de rede ao validar token: ${(e as Error).message}`);
      }

      // 2. /me/permissions
      if (tokenValid) {
        try {
          const permRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me/permissions?access_token=${encodeURIComponent(token)}`);
          const permJson = await permRes.json();
          if (permRes.ok && Array.isArray(permJson.data)) {
            granted = permJson.data.filter((p: any) => p.status === "granted").map((p: any) => p.permission);
            declined = permJson.data.filter((p: any) => p.status !== "granted").map((p: any) => p.permission);
            missing = REQUIRED_PERMISSIONS.filter(p => !granted.includes(p));
            if (missing.length > 0) {
              errors.push(`Permissões obrigatórias ausentes: ${missing.join(", ")}`);
            }
          } else {
            errors.push(`Não foi possível ler permissões: ${permJson.error?.message || "resposta inesperada"}`);
          }
        } catch (e) {
          errors.push(`Erro ao listar permissões: ${(e as Error).message}`);
        }
      }

      // 3. /{ig_user_id}
      if (tokenValid && cfg.ig_user_id) {
        try {
          const igRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${cfg.ig_user_id}?fields=username,name&access_token=${encodeURIComponent(token)}`);
          const igJson = await igRes.json();
          if (igRes.ok && igJson.username) {
            igAccountValid = true;
            igUsername = igJson.username;
          } else {
            errors.push(`IG User ID inválido ou sem acesso: ${igJson.error?.message || "username não retornado"}`);
          }
        } catch (e) {
          errors.push(`Erro ao consultar IG User: ${(e as Error).message}`);
        }
      } else if (!cfg.ig_user_id) {
        errors.push("IG User ID não configurado.");
      }

      const ok = tokenValid && igAccountValid && missing.length === 0;
      const summary = ok
        ? `OK @${igUsername} — todas permissões OK`
        : errors.join(" | ");

      await serviceClient.from("instagram_config").update({
        ultima_verificacao_at: new Date().toISOString(),
        ultimo_erro: ok ? null : summary.slice(0, 500),
        ig_username: igUsername || undefined,
      }).eq("tenant_id", profile.tenant_id);

      return new Response(JSON.stringify({
        ok,
        token_valid: tokenValid,
        ig_account_valid: igAccountValid,
        ig_username: igUsername,
        permissions: {
          granted,
          declined,
          missing,
          required: REQUIRED_PERMISSIONS,
          optional: OPTIONAL_PERMISSIONS,
          missing_optional: OPTIONAL_PERMISSIONS.filter(p => !granted.includes(p)),
        },
        errors,
        summary,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============ Existing actions ============
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
    const fullUrl = `${url}${sep}access_token=${encodeURIComponent(token)}`;
    console.log(`IG proxy → ${action || endpoint} | token prefix=${token.slice(0,6)} len=${token.length}`);

    const opts: RequestInit = {
      method: httpMethod,
      headers: { "Content-Type": "application/json" },
    };
    if (httpMethod !== "GET" && data) opts.body = JSON.stringify(data);

    const res = await fetch(fullUrl, opts);
    const responseData = await res.json();

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
