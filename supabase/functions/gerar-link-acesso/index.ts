import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Caller deve ser admin
    const { data: callerRoles } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id);
    const callerRole = callerRoles?.[0]?.role;
    if (!callerRole || !["admin_tenant", "admin_master"].includes(callerRole)) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await adminClient
      .from("profiles").select("tenant_id").eq("id", caller.id).single();

    const body = await req.json();
    const { user_id, redirect_base } = body;
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Target deve ser do mesmo tenant
    const { data: targetProfile } = await adminClient
      .from("profiles").select("tenant_id").eq("id", user_id).single();
    if (!targetProfile || targetProfile.tenant_id !== callerProfile?.tenant_id) {
      return new Response(JSON.stringify({ error: "Usuário não pertence à sua empresa" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Target não pode ser admin_master
    const { data: targetRoles } = await adminClient
      .from("user_roles").select("role").eq("user_id", user_id);
    if (targetRoles?.some((r: any) => r.role === "admin_master")) {
      return new Response(JSON.stringify({ error: "Não é possível gerar link para Admin Master" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pegar e-mail do target
    const { data: targetUser, error: getErr } = await adminClient.auth.admin.getUserById(user_id);
    if (getErr || !targetUser?.user?.email) {
      return new Response(JSON.stringify({ error: "Usuário não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base = (typeof redirect_base === "string" && redirect_base) || "https://prbot.online";
    const redirectTo = `${base.replace(/\/+$/, "")}/reset-password`;

    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: targetUser.user.email,
      options: { redirectTo },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      return new Response(JSON.stringify({ error: linkErr?.message || "Falha ao gerar link" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      action_link: linkData.properties.action_link,
      email: targetUser.user.email,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
