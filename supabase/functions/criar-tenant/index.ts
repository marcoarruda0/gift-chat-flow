import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Cliente com JWT do usuário para identificá-lo
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const nome = (body?.nome ?? "").toString().trim();
    if (!nome || nome.length < 2 || nome.length > 120) {
      return new Response(
        JSON.stringify({ error: "Nome da empresa inválido (2-120 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cliente admin (bypass RLS)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verifica role do chamador
    const { data: roles, error: rolesErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (rolesErr) {
      return new Response(
        JSON.stringify({ error: "Erro ao verificar permissões", details: rolesErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const roleSet = new Set((roles || []).map((r: any) => r.role));
    const isAdmin = roleSet.has("admin_master") || roleSet.has("admin_tenant");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem criar empresas" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Criar tenant
    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .insert({ nome })
      .select("id, nome")
      .single();

    if (tenantErr || !tenant) {
      return new Response(
        JSON.stringify({ error: "Falha ao criar empresa", details: tenantErr?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Vincular usuário ao novo tenant
    const { error: utErr } = await admin
      .from("user_tenants")
      .insert({ user_id: userId, tenant_id: tenant.id });

    if (utErr && !utErr.message.includes("duplicate")) {
      console.error("user_tenants insert failed:", utErr.message);
    }

    // 3. Garantir role admin_tenant (idempotente — user_roles é global)
    if (!roleSet.has("admin_tenant") && !roleSet.has("admin_master")) {
      await admin
        .from("user_roles")
        .insert({ user_id: userId, role: "admin_tenant" });
    }

    return new Response(
      JSON.stringify({ ok: true, tenant }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Erro inesperado", details: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
