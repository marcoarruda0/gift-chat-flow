// Webhook BlinkChat — consulta de saldo por CPF
// POST /saldos-consultar/{token}
// Body: { cpf: string, valor_item: number }
//
// Sucesso (200):     { ok:true, nome, cpf, saldo_consignado, saldo_moeda_pr, saldo_total, valor_item, suficiente:true }
// Saldo insuficiente (400): { ok:false, codigo:"SALDO_INSUFICIENTE", saldo_total, valor_item, erro }
// CPF nao encontrado (404): { ok:false, codigo:"CPF_NAO_ENCONTRADO", erro }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
const maskToken = (t: string) => (!t ? "" : t.length <= 8 ? "***" : `${t.slice(0, 5)}...${t.slice(-4)}`);
const maskCpf = (c: string) => (!c || c.length < 11 ? "***" : `${c.slice(0, 3)}***${c.slice(-2)}`);

function jsonOk(payload: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...payload }), { status: 200, headers: jsonHeaders });
}
function jsonError(status: number, codigo: string, erro: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: false, codigo, erro, ...extra }), { status, headers: jsonHeaders });
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "use POST");

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const idx = segments.indexOf("saldos-consultar");
    const token = idx >= 0 && segments.length > idx + 1 ? segments[idx + 1] : "";

    if (!token || !token.startsWith("bc_")) {
      console.error(`[${requestId}] TOKEN_INVALID token=${maskToken(token)}`);
      return jsonError(404, "TOKEN_INVALID", "token de integracao ausente ou invalido");
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "BODY_INVALID", "body deve ser JSON valido");
    }

    const cpfRaw = typeof body?.cpf === "string" ? body.cpf : "";
    const valorItem = Number(body?.valor_item);
    const cpf = onlyDigits(cpfRaw);

    if (cpf.length !== 11 && cpf.length !== 14) {
      return jsonError(400, "CPF_INVALIDO", "cpf deve ter 11 ou 14 digitos");
    }
    if (!Number.isFinite(valorItem) || valorItem <= 0) {
      return jsonError(400, "VALOR_INVALIDO", "valor_item deve ser numero positivo");
    }

    console.log(`[${requestId}] IN token=${maskToken(token)} cpf=${maskCpf(cpf)} valor=${valorItem}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg, error: cfgErr } = await supabase
      .from("vendas_online_config")
      .select("tenant_id")
      .eq("blinkchat_token", token)
      .maybeSingle();

    if (cfgErr) {
      console.error(`[${requestId}] DB_ERROR token lookup ${cfgErr.message}`);
      return jsonError(500, "DB_ERROR", `falha ao validar token (${cfgErr.message})`);
    }
    if (!cfg) return jsonError(404, "TOKEN_NOT_FOUND", "token nao reconhecido");

    const tenantId = cfg.tenant_id;

    // Busca saldos em paralelo
    const [moedaRes, consigRes] = await Promise.all([
      supabase
        .from("saldos_moeda_pr")
        .select("nome, saldo")
        .eq("tenant_id", tenantId)
        .eq("cpf_cnpj", cpf),
      supabase
        .from("saldos_consignado")
        .select("nome, saldo_total")
        .eq("tenant_id", tenantId)
        .eq("cpf_cnpj", cpf),
    ]);

    if (moedaRes.error) {
      console.error(`[${requestId}] DB_ERROR moeda ${moedaRes.error.message}`);
      return jsonError(500, "DB_ERROR", `falha ao consultar moeda PR (${moedaRes.error.message})`);
    }
    if (consigRes.error) {
      console.error(`[${requestId}] DB_ERROR consig ${consigRes.error.message}`);
      return jsonError(500, "DB_ERROR", `falha ao consultar consignado (${consigRes.error.message})`);
    }

    const moedaRows = moedaRes.data || [];
    const consigRows = consigRes.data || [];

    if (moedaRows.length === 0 && consigRows.length === 0) {
      console.warn(`[${requestId}] CPF_NAO_ENCONTRADO tenant=${tenantId} cpf=${maskCpf(cpf)}`);
      return jsonError(404, "CPF_NAO_ENCONTRADO", "CPF sem cadastro nas tabelas de saldo");
    }

    const saldoMoeda = moedaRows.reduce((acc, r: any) => acc + Number(r.saldo || 0), 0);
    const saldoConsig = consigRows.reduce((acc, r: any) => acc + Number(r.saldo_total || 0), 0);
    const saldoTotal = saldoMoeda + saldoConsig;

    const nome =
      moedaRows.find((r: any) => r.nome)?.nome ||
      consigRows.find((r: any) => r.nome)?.nome ||
      null;

    const elapsed = Date.now() - started;

    if (saldoTotal < valorItem) {
      console.log(
        `[${requestId}] INSUFICIENTE tenant=${tenantId} saldo=${saldoTotal} valor=${valorItem} ms=${elapsed}`,
      );
      return jsonError(400, "SALDO_INSUFICIENTE", "saldo insuficiente", {
        nome,
        cpf,
        saldo_consignado: saldoConsig,
        saldo_moeda_pr: saldoMoeda,
        saldo_total: saldoTotal,
        valor_item: valorItem,
        suficiente: false,
      });
    }

    console.log(
      `[${requestId}] OK tenant=${tenantId} saldo=${saldoTotal} valor=${valorItem} ms=${elapsed}`,
    );

    return jsonOk({
      nome,
      cpf,
      saldo_consignado: saldoConsig,
      saldo_moeda_pr: saldoMoeda,
      saldo_total: saldoTotal,
      valor_item: valorItem,
      suficiente: true,
    });
  } catch (e) {
    const elapsed = Date.now() - started;
    console.error(`[${requestId}] UNEXPECTED ${(e as Error).message} ms=${elapsed}`);
    return jsonError(500, "INTERNAL", `erro interno (${(e as Error).message})`);
  }
});
