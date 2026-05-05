// Webhook BlinkChat — confirmacao de venda (debito de saldo)
// POST /saldos-confirmar/{token}
// Body: { cpf: string, valor_item: number, confirmado: boolean }
//
// Sucesso (200): { ok:true, nome, cpf, valor_debitado, debito_moeda_pr, debito_consignado, saldo_restante }
// Erros (400/404/409/500): { ok:false, codigo, erro }
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
    const idx = segments.indexOf("saldos-confirmar");
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
    const confirmado = body?.confirmado === true;
    const cpf = onlyDigits(cpfRaw);

    if (cpf.length !== 11 && cpf.length !== 14) {
      return jsonError(400, "CPF_INVALIDO", "cpf deve ter 11 ou 14 digitos");
    }
    if (!Number.isFinite(valorItem) || valorItem <= 0) {
      return jsonError(400, "VALOR_INVALIDO", "valor_item deve ser numero positivo");
    }
    if (!confirmado) {
      return jsonError(400, "NAO_CONFIRMADO", "confirmado deve ser true");
    }

    console.log(
      `[${requestId}] IN token=${maskToken(token)} cpf=${maskCpf(cpf)} valor=${valorItem}`,
    );

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

    // Chama funcao atomica do Postgres
    const { data, error } = await supabase.rpc("debitar_saldo_blinkchat", {
      p_tenant_id: tenantId,
      p_cpf: cpf,
      p_valor: valorItem,
    });

    const elapsed = Date.now() - started;

    if (error) {
      const msg = error.message || "";
      console.error(`[${requestId}] RPC_ERROR ${msg} ms=${elapsed}`);

      if (msg.includes("SALDO_INSUFICIENTE")) {
        return jsonError(400, "SALDO_INSUFICIENTE", "saldo insuficiente para concluir o debito");
      }
      if (msg.includes("DUPLICADO")) {
        return jsonError(409, "DUPLICADO", "debito identico nos ultimos 30 segundos (ignorado)");
      }
      if (msg.includes("CPF_INVALIDO")) {
        return jsonError(400, "CPF_INVALIDO", "cpf invalido");
      }
      if (msg.includes("VALOR_INVALIDO")) {
        return jsonError(400, "VALOR_INVALIDO", "valor invalido");
      }
      return jsonError(500, "DB_ERROR", `falha ao debitar (${msg})`);
    }

    console.log(
      `[${requestId}] OK tenant=${tenantId} valor=${valorItem} restante=${(data as any)?.saldo_restante} ms=${elapsed}`,
    );

    return jsonOk({
      cpf: (data as any)?.cpf,
      nome: (data as any)?.nome,
      valor_debitado: (data as any)?.valor_debitado,
      debito_moeda_pr: (data as any)?.debito_moeda_pr,
      debito_consignado: (data as any)?.debito_consignado,
      saldo_restante: (data as any)?.saldo_restante,
    });
  } catch (e) {
    const elapsed = Date.now() - started;
    console.error(`[${requestId}] UNEXPECTED ${(e as Error).message} ms=${elapsed}`);
    return jsonError(500, "INTERNAL", `erro interno (${(e as Error).message})`);
  }
});
