import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check caller is admin_tenant or admin_master
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const callerRole = callerRoles?.[0]?.role;
    if (!callerRole || !["admin_tenant", "admin_master"].includes(callerRole)) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get caller tenant
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", caller.id)
      .single();

    const body = await req.json();
    const { action, user_id, new_role } = body;

    if (!action || !user_id) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cannot act on yourself
    if (user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Não é possível alterar a si mesmo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify target is same tenant
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", user_id)
      .single();

    if (!targetProfile || targetProfile.tenant_id !== callerProfile?.tenant_id) {
      return new Response(JSON.stringify({ error: "Usuário não pertence à sua empresa" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check target is not admin_master
    const { data: targetRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id);

    if (targetRoles?.some((r: any) => r.role === "admin_master")) {
      return new Response(JSON.stringify({ error: "Não é possível alterar um Admin Master" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_role") {
      if (!new_role || !["admin_tenant", "atendente", "caixa"].includes(new_role)) {
        return new Response(JSON.stringify({ error: "Função inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient
        .from("user_roles")
        .update({ role: new_role })
        .eq("user_id", user_id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "remove_member") {
      // Delete roles
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      // Delete profile
      await adminClient.from("profiles").delete().eq("id", user_id);
      // Delete auth user
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
