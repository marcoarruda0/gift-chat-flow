// Endpoint público para integração com Blinkchat
// GET /blinkchat-produto/{token}?id=1
// Cada tenant tem um token secreto único (configurado em Vendas Online > Configurações).
// Retorna JSON.
//
// Sucesso (200):
//   { ok: true, numero, descricao, valor, valor_formatado, status, link }
// Erro (400/404/500):
//   { ok: false, codigo, erro }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function jsonError(status: number, codigo: string, erro: string): Response {
  return new Response(JSON.stringify({ ok: false, codigo, erro }), {
    status,
    headers: jsonHeaders,
  });
}

function jsonOk(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    status: 200,
    headers: jsonHeaders,
  });
}

function maskToken(t: string): string {
  if (!t) return "";
  if (t.length <= 8) return "***";
  return `${t.slice(0, 5)}...${t.slice(-4)}`;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const idx = segments.indexOf("blinkchat-produto");
    const token = idx >= 0 && segments.length > idx + 1 ? segments[idx + 1] : "";
    const idParam = url.searchParams.get("id");
    const userAgent = req.headers.get("user-agent") || "";
    const referer = req.headers.get("referer") || "";

    console.log(
      `[${requestId}] IN method=${req.method} token=${maskToken(token)} id=${idParam} ua="${userAgent}" ref="${referer}"`,
    );

    if (!token || !token.startsWith("bc_")) {
      console.error(`[${requestId}] VALIDATION token ausente ou invalido`);
      return jsonError(404, "TOKEN_INVALID", "token de integracao ausente ou invalido na URL");
    }

    if (!idParam) {
      console.error(`[${requestId}] VALIDATION id ausente`);
      return jsonError(400, "ID_MISSING", "parametro 'id' e obrigatorio");
    }

    const numero = parseInt(idParam, 10);
    if (!Number.isFinite(numero) || numero < 1) {
      console.error(`[${requestId}] VALIDATION id invalido: ${idParam}`);
      return jsonError(400, "ID_INVALID", `id invalido (${idParam})`);
    }

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
      console.error(`[${requestId}] DB_ERROR token lookup: ${cfgErr.message}`);
      return jsonError(500, "DB_ERROR", `falha ao validar token (${cfgErr.message})`);
    }

    if (!cfg) {
      console.warn(`[${requestId}] TOKEN_NOT_FOUND ${maskToken(token)}`);
      return jsonError(404, "TOKEN_NOT_FOUND", "token de integracao nao reconhecido");
    }

    const tenantId = cfg.tenant_id;

    const { data, error } = await supabase
      .from("chamado_denis_itens")
      .select("numero, descricao, valor, status, abacate_url")
      .eq("tenant_id", tenantId)
      .eq("numero", numero)
      .maybeSingle();

    if (error) {
      console.error(`[${requestId}] DB_ERROR ${error.message} code=${error.code}`);
      return jsonError(500, "DB_ERROR", `falha ao consultar produto (${error.message})`);
    }

    if (!data) {
      console.warn(`[${requestId}] NOT_FOUND tenant=${tenantId} numero=${numero}`);
      return jsonError(400, "NOT_FOUND", `produto ${numero} nao encontrado`);
    }

    const valor = Number(data.valor || 0);
    const descricao = (data.descricao || "").trim() || "sem descricao";
    const status = (data.status || "").trim() || "disponivel";
    const link = (data.abacate_url || "").trim() || "sem link";

    const elapsed = Date.now() - startedAt;
    console.log(
      `[${requestId}] OK tenant=${tenantId} numero=${data.numero} status=${status} elapsed_ms=${elapsed}`,
    );

    return jsonOk({
      numero: data.numero,
      descricao,
      valor,
      valor_formatado: `R$ ${formatBRL(valor)}`,
      status,
      link,
    });
  } catch (e) {
    const elapsed = Date.now() - startedAt;
    console.error(`[${requestId}] UNEXPECTED ${(e as Error).message} elapsed_ms=${elapsed}`);
    return jsonError(500, "INTERNAL", `erro interno (${(e as Error).message})`);
  }
});
