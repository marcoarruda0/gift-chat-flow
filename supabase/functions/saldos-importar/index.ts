// Edge function: importa planilha .xlsx e substitui (truncate + insert) os dados
// das tabelas saldos_consignado ou saldos_moeda_pr para o tenant do usuário.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const apenasDigitos = (v: unknown): string =>
  String(v ?? "").replace(/\D/g, "");

function parseSaldoBR(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (!s) return 0;
  // "R$ 1.234,56" -> "1234.56"
  const limpo = s
    .replace(/[Rr]\$\s*/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

function toBigIntStrOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toStrOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function toDateISOOrNull(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  // xlsx pode retornar número de série Excel; cellDates:true evita isso
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Cliente com JWT do usuário para identificar quem está chamando
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "invalid_user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Cliente service role para escrever (bypassa RLS, mas validamos manualmente)
    const admin = createClient(supabaseUrl, serviceKey);

    // Profile (tenant + nome)
    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id, nome")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "no_tenant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const tenantId = profile.tenant_id;

    // Verifica role admin_tenant ou admin_master
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleSet = new Set((roles || []).map((r: any) => r.role));
    if (!roleSet.has("admin_tenant") && !roleSet.has("admin_master")) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const tipo = String(body?.tipo || "").trim();
    const arquivoNome = String(body?.arquivo_nome || "").trim() || null;
    const linhas = Array.isArray(body?.linhas) ? body.linhas.filter(isPlainObject) : null;

    if (!linhas) {
      return new Response(JSON.stringify({ error: "missing_rows" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (tipo !== "consignado" && tipo !== "moeda_pr") {
      return new Response(JSON.stringify({ error: "invalid_tipo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (linhas.length === 0) {
      return new Response(JSON.stringify({ error: "no_rows" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let tabela = "";
    let mapper: (r: any) => any;

    if (tipo === "consignado") {
      tabela = "saldos_consignado";
      const expected = ["cpf_cnpj", "saldo_total", "nome"];
      const first = linhas[0];
      const missing = expected.filter((c) => !(c in first));
      if (missing.length) {
        return new Response(
          JSON.stringify({
            error: "invalid_headers",
            detalhe: `Colunas faltando: ${missing.join(", ")}`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      mapper = (r: any) => ({
        tenant_id: tenantId,
        loja_id: toIntOrNull(r.loja_id),
        loja_nome: toStrOrNull(r.loja_nome),
        fornecedor_id_externo: toBigIntStrOrNull(r.id),
        codigo_maqplan: toStrOrNull(r.codigo_maqplan),
        nome: toStrOrNull(r.nome),
        email: toStrOrNull(r.email),
        telefone: toStrOrNull(r.telefone),
        celular: toStrOrNull(r.celular),
        cpf_cnpj: apenasDigitos(r.cpf_cnpj) || null,
        representante: toStrOrNull(r.representante),
        interno: toIntOrNull(r.interno),
        numero_contrato: toStrOrNull(r.numero_contrato),
        saldo_bloqueado: parseSaldoBR(r.saldo_bloqueado),
        saldo_liberado: parseSaldoBR(r.saldo_liberado),
        saldo_total: parseSaldoBR(r.saldo_total),
        data_cadastro: toDateISOOrNull(r.data_cadastro),
      });
    } else {
      tabela = "saldos_moeda_pr";
      const expected = ["CPF/CNPJ", "Saldo", "Nome"];
      const first = linhas[0];
      const missing = expected.filter((c) => !(c in first));
      if (missing.length) {
        return new Response(
          JSON.stringify({
            error: "invalid_headers",
            detalhe: `Colunas faltando: ${missing.join(", ")}`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      mapper = (r: any) => ({
        tenant_id: tenantId,
        cliente_id_externo: toBigIntStrOrNull(r["ID"]),
        nome: toStrOrNull(r["Nome"]),
        cpf_cnpj: apenasDigitos(r["CPF/CNPJ"]) || null,
        email: toStrOrNull(r["Email"]),
        telefone: toStrOrNull(r["Telefone"]),
        loja: toStrOrNull(r["Loja"]),
        saldo: parseSaldoBR(r["Saldo"]),
      });
    }

    // Substitui dados: delete + insert em batches
    const { error: delErr } = await admin
      .from(tabela)
      .delete()
      .eq("tenant_id", tenantId);
    if (delErr) {
      return new Response(
        JSON.stringify({ error: "delete_failed", detalhe: delErr.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Insere em batches pequenos a partir de linhas já parseadas no cliente
    const BATCH = 100;
    let inseridos = 0;
    const total = linhas.length;

    for (let start = 0; start < linhas.length; start += BATCH) {
      const chunk = linhas.slice(start, start + BATCH).map(mapper);

      const { error: insErr } = await admin.from(tabela).insert(chunk);
      if (insErr) {
        return new Response(
          JSON.stringify({
            error: "insert_failed",
            detalhe: insErr.message,
            inseridos_parcial: inseridos,
            total,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      inseridos += chunk.length;
    }

    // Log de upload
    await admin.from("saldos_uploads_log").insert({
      tenant_id: tenantId,
      tipo,
      arquivo_nome: arquivoNome,
      total_linhas: inseridos,
      usuario_id: userId,
      usuario_nome: profile.nome ?? null,
    });

    return new Response(
      JSON.stringify({ ok: true, total: inseridos, tabela }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: "internal_error", detalhe: e?.message ?? String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
