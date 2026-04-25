// Envia uma única mensagem de teste para um contato usando uma regra de comunicação
// existente. Usado pelo botão "Enviar teste" no painel de regras.
// Requer JWT do usuário (admin_tenant ou admin_master).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";

const fmtBRL = (n: number | null | undefined) =>
  `R$ ${(Number(n) || 0).toFixed(2).replace(".", ",")}`;

const fmtData = (iso?: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
};

const diffDias = (alvoISO?: string | null, hojeISO?: string) => {
  if (!alvoISO) return "";
  const hoje = hojeISO ? new Date(hojeISO + "T00:00:00Z") : new Date();
  const alvo = new Date(alvoISO + "T00:00:00Z");
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000).toString();
};

function buildVarsMap(ctx: any): Record<string, string> {
  return {
    nome_cliente: ctx.contato?.nome || "",
    nome_empresa: ctx.tenant?.nome || "",
    valor_giftback: fmtBRL(ctx.movimento?.valor),
    saldo_giftback: fmtBRL(ctx.contato?.saldo_giftback ?? 0),
    id_giftback: String(ctx.movimento?.id || "").slice(0, 8).toUpperCase(),
    data_vencimento: fmtData(ctx.movimento?.validade),
    dias_ate_expirar: diffDias(ctx.movimento?.validade, ctx.hojeISO),
  };
}

function resolverVariaveis(texto: string, vars: Record<string, string>): string {
  if (!texto) return "";
  return texto.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => vars[key] ?? "");
}

function extractMetaPlaceholders(text: string): number[] {
  const matches = (text || "").matchAll(/\{\{(\d+)\}\}/g);
  const nums = new Set<number>();
  for (const m of matches) nums.add(parseInt(m[1], 10));
  return Array.from(nums).sort((a, b) => a - b);
}

function montarComponents(
  templateComponents: any[],
  mapping: Record<string, string>,
  vars: Record<string, string>,
): any[] {
  const out: any[] = [];
  for (const comp of templateComponents || []) {
    const type = String(comp?.type || "").toUpperCase();
    if (type === "HEADER") {
      if (String(comp.format || "TEXT").toUpperCase() !== "TEXT") continue;
      const ph = extractMetaPlaceholders(comp.text || "");
      if (ph.length === 0) continue;
      out.push({
        type: "header",
        parameters: ph.map((n) => ({
          type: "text",
          text: resolverVariaveis(mapping[`header.${n}`] || "", vars),
        })),
      });
    } else if (type === "BODY") {
      const ph = extractMetaPlaceholders(comp.text || "");
      if (ph.length === 0) continue;
      out.push({
        type: "body",
        parameters: ph.map((n) => ({
          type: "text",
          text: resolverVariaveis(mapping[`body.${n}`] || "", vars),
        })),
      });
    }
  }
  return out;
}

function buildPreviewText(
  templateComponents: any[],
  mappingVariaveis: Record<string, string>,
  vars: Record<string, string>,
): string {
  const body = (templateComponents || []).find(
    (c: any) => String(c?.type || "").toUpperCase() === "BODY",
  );
  if (!body?.text) return "";
  let txt = body.text as string;
  for (const n of extractMetaPlaceholders(txt)) {
    const raw = mappingVariaveis[`body.${n}`] || "";
    txt = txt.split(`{{${n}}}`).join(resolverVariaveis(raw, vars));
  }
  return txt;
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

    // Cliente com auth do usuário (para validar identidade)
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Sessão inválida" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cliente service-role para acessar todos os dados
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenant_id = profile?.tenant_id;
    if (!tenant_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Usuário sem tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verifica role admin
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles || []).some(
      (r: any) => r.role === "admin_tenant" || r.role === "admin_master",
    );
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ ok: false, error: "Permissão negada" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { regra_id, contato_id, movimento_id } = body || {};
    if (!regra_id || !contato_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "regra_id e contato_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Carrega regra (deve ser do mesmo tenant)
    const { data: regra } = await supabase
      .from("giftback_comunicacao_regras")
      .select("*")
      .eq("id", regra_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();
    if (!regra) {
      return new Response(
        JSON.stringify({ ok: false, error: "Regra não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Contato
    const { data: contato } = await supabase
      .from("contatos")
      .select("id, nome, telefone, saldo_giftback")
      .eq("id", contato_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();
    if (!contato) {
      return new Response(
        JSON.stringify({ ok: false, error: "Contato não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!contato.telefone) {
      return new Response(
        JSON.stringify({ ok: false, error: "Contato sem telefone cadastrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Movimento (real ou mock)
    let movimento: any = null;
    if (movimento_id) {
      const { data: mov } = await supabase
        .from("giftback_movimentos")
        .select("id, valor, validade, status, created_at")
        .eq("id", movimento_id)
        .eq("tenant_id", tenant_id)
        .maybeSingle();
      movimento = mov;
    }
    if (!movimento) {
      const validadeMock = new Date(Date.now() + 7 * 86_400_000).toISOString().split("T")[0];
      movimento = { id: "exemplo0", valor: 50, validade: validadeMock };
    }

    // Tenant + cloud config
    const [{ data: tenantRow }, { data: cloud }] = await Promise.all([
      supabase.from("tenants").select("nome").eq("id", tenant_id).maybeSingle(),
      supabase
        .from("whatsapp_cloud_config")
        .select("phone_number_id, access_token")
        .eq("tenant_id", tenant_id)
        .maybeSingle(),
    ]);

    if (!cloud?.phone_number_id || !cloud?.access_token) {
      return new Response(
        JSON.stringify({ ok: false, error: "WhatsApp Oficial não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const hojeISO = new Date().toISOString().split("T")[0];
    const vars = buildVarsMap({ contato, tenant: tenantRow, movimento, hojeISO });
    const components = montarComponents(
      (regra.template_components as any[]) || [],
      (regra.template_variaveis as Record<string, string>) || {},
      vars,
    );
    const preview_text = buildPreviewText(
      (regra.template_components as any[]) || [],
      (regra.template_variaveis as Record<string, string>) || {},
      vars,
    );

    const phone = String(contato.telefone).replace(/\D/g, "");
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: regra.template_name,
        language: { code: regra.template_language },
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
    const json = await res.json();

    if (!res.ok) {
      const errMsg = json?.error?.message || `HTTP ${res.status}`;
      // Registra log de teste com falha (movimento_id obrigatório → usa o real ou o mock UUID gerado)
      // Como movimento_id é uuid e movimento mock não tem uuid válido, só insere se for movimento real
      if (movimento_id) {
        await supabase.from("giftback_comunicacao_log").insert({
          tenant_id,
          regra_id,
          movimento_id,
          contato_id,
          status: "falha",
          erro: `[TESTE] ${errMsg}`.slice(0, 500),
          is_teste: true,
        });
      }
      return new Response(
        JSON.stringify({ ok: false, error: errMsg, preview_text }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const wa_message_id = json?.messages?.[0]?.id || null;
    if (movimento_id) {
      await supabase.from("giftback_comunicacao_log").insert({
        tenant_id,
        regra_id,
        movimento_id,
        contato_id,
        status: "enviado",
        wa_message_id,
        is_teste: true,
      });
    }

    return new Response(
      JSON.stringify({ ok: true, wa_message_id, preview_text }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[enviar-teste-gb]", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
