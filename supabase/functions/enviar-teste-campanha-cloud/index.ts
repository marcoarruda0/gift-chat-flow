// Envia uma mensagem de teste de template WhatsApp Cloud para um número informado.
// NÃO grava em campanhas / campanha_destinatarios — é apenas validação de payload.
// Requer JWT do usuário (admin_tenant ou admin_master).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";

// Resolve {nome}, {telefone}, {email}, {cpf}, {endereco} e campos personalizados
function resolveVariable(template: string, contato: any): string {
  if (!template) return "";
  let out = template;
  const replacements: Record<string, string> = {
    nome: contato?.nome || "",
    telefone: contato?.telefone || "",
    email: contato?.email || "",
    cpf: contato?.cpf || "",
    endereco: contato?.endereco || "",
  };
  for (const [k, v] of Object.entries(replacements)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "gi"), v);
  }
  const custom = contato?.campos_personalizados || {};
  for (const [k, v] of Object.entries(custom)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "gi"), String(v ?? ""));
  }
  return out;
}

function extractPlaceholders(text: string): number[] {
  const matches = (text || "").matchAll(/\{\{(\d+)\}\}/g);
  const nums = new Set<number>();
  for (const m of matches) nums.add(parseInt(m[1], 10));
  return Array.from(nums).sort((a, b) => a - b);
}

function buildTemplateComponents(
  templateComponents: any[],
  variaveis: Record<string, string>,
  contato: any,
): any[] {
  const out: any[] = [];
  for (const comp of templateComponents || []) {
    const type = String(comp.type || "").toUpperCase();
    if (type === "HEADER") {
      const format = String(comp.format || "TEXT").toUpperCase();
      if (format === "TEXT") {
        const ph = extractPlaceholders(comp.text || "");
        if (ph.length === 0) continue;
        out.push({
          type: "header",
          parameters: ph.map((n) => ({
            type: "text",
            text: resolveVariable(variaveis[`header.${n}`] || "", contato),
          })),
        });
      } else if (format === "IMAGE" && comp.media_url) {
        out.push({
          type: "header",
          parameters: [{ type: "image", image: { link: comp.media_url } }],
        });
      } else if (format === "VIDEO" && comp.media_url) {
        out.push({
          type: "header",
          parameters: [{ type: "video", video: { link: comp.media_url } }],
        });
      }
    } else if (type === "BODY") {
      const ph = extractPlaceholders(comp.text || "");
      if (ph.length === 0) continue;
      out.push({
        type: "body",
        parameters: ph.map((n) => ({
          type: "text",
          text: resolveVariable(variaveis[`body.${n}`] || "", contato),
        })),
      });
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Sessão inválida" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Confere papel
    const { data: profile } = await adminClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", userData.user.id)
      .single();

    if (!profile?.tenant_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Tenant não encontrado" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isAdmin = (roles || []).some(
      (r: any) => r.role === "admin_tenant" || r.role === "admin_master",
    );
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ ok: false, error: "Apenas administradores podem testar disparos" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const {
      telefone,
      template_name,
      template_language,
      template_components,
      template_variaveis,
    } = body || {};

    if (!telefone || !template_name || !template_language) {
      return new Response(
        JSON.stringify({ ok: false, error: "Telefone e dados do template são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Carrega config WhatsApp Cloud
    const { data: cloud } = await adminClient
      .from("whatsapp_cloud_config")
      .select("phone_number_id, access_token, status")
      .eq("tenant_id", profile.tenant_id)
      .single();

    if (!cloud?.phone_number_id || !cloud?.access_token) {
      return new Response(
        JSON.stringify({ ok: false, error: "WhatsApp Oficial não está configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Contato fictício para resolver variáveis dinâmicas no preview
    const sampleContato = {
      nome: "Cliente Teste",
      telefone,
      email: "teste@exemplo.com",
      cpf: "",
      endereco: "",
      campos_personalizados: {},
    };

    const components = buildTemplateComponents(
      template_components || [],
      template_variaveis || {},
      sampleContato,
    );

    const phoneClean = String(telefone).replace(/\D/g, "");
    const payload = {
      messaging_product: "whatsapp",
      to: phoneClean,
      type: "template",
      template: {
        name: template_name,
        language: { code: template_language },
        components,
      },
    };

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${cloud.phone_number_id}/messages`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cloud.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    const respJson = await res.json();

    return new Response(
      JSON.stringify({
        ok: res.ok,
        status: res.status,
        payload_enviado: payload,
        response: respJson,
        wa_message_id: respJson?.messages?.[0]?.id || null,
        error: res.ok
          ? null
          : (respJson?.error?.error_user_msg ||
            respJson?.error?.message ||
            `HTTP ${res.status}`),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, // sempre 200 — o status real está no body
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
