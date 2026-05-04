// Endpoint público para integração com Blinkchat
// GET /blinkchat-produto/{token}?id=1
// Cada tenant tem um token secreto único (configurado em Vendas Online > Configurações).
// Retorna texto simples no formato fixo:
//   "{numero} - {descricao} - R$ {valor} - {status} - {link}"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const textHeaders = { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" };

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatLine(numero: number | string, descricao: string, valor: number, status: string, link: string): string {
  const desc = (descricao || "").trim() || "sem descricao";
  const stat = (status || "").trim() || "disponivel";
  const lnk = (link || "").trim() || "sem link";
  return `${numero} - ${desc} - R$ ${formatBRL(Number(valor || 0))} - ${stat} - ${lnk}`;
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
    // pathname ex: /blinkchat-produto/bc_abc123...
    // O último segmento depois de "blinkchat-produto" é o token.
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
      return new Response("ERRO: token de integracao ausente ou invalido na URL", {
        status: 404,
        headers: textHeaders,
      });
    }

    if (!idParam) {
      console.error(`[${requestId}] VALIDATION id ausente`);
      return new Response("ERRO: parametro 'id' e obrigatorio", { status: 400, headers: textHeaders });
    }

    const numero = parseInt(idParam, 10);
    if (!Number.isFinite(numero) || numero < 1) {
      console.error(`[${requestId}] VALIDATION id invalido: ${idParam}`);
      return new Response(`ERRO: id invalido (${idParam})`, { status: 400, headers: textHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve tenant pelo token
    const { data: cfg, error: cfgErr } = await supabase
      .from("vendas_online_config")
      .select("tenant_id")
      .eq("blinkchat_token", token)
      .maybeSingle();

    if (cfgErr) {
      console.error(`[${requestId}] DB_ERROR token lookup: ${cfgErr.message}`);
      return new Response(`ERRO: falha ao validar token (${cfgErr.message})`, {
        status: 500,
        headers: textHeaders,
      });
    }

    if (!cfg) {
      console.warn(`[${requestId}] TOKEN_NOT_FOUND ${maskToken(token)}`);
      return new Response("ERRO: token de integracao nao reconhecido", { status: 404, headers: textHeaders });
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
      return new Response(`ERRO: falha ao consultar produto (${error.message})`, {
        status: 500,
        headers: textHeaders,
      });
    }

    if (!data) {
      console.warn(`[${requestId}] NOT_FOUND tenant=${tenantId} numero=${numero}`);
      return new Response(`ERRO: produto ${numero} nao encontrado`, { status: 400, headers: textHeaders });
    }

    const body = formatLine(
      data.numero,
      data.descricao || "",
      Number(data.valor || 0),
      data.status || "disponivel",
      data.abacate_url || "",
    );

    const elapsed = Date.now() - startedAt;
    console.log(
      `[${requestId}] OK tenant=${tenantId} numero=${data.numero} status=${data.status} elapsed_ms=${elapsed}`,
    );

    return new Response(body, { status: 200, headers: textHeaders });
  } catch (e) {
    const elapsed = Date.now() - startedAt;
    console.error(`[${requestId}] UNEXPECTED ${(e as Error).message} elapsed_ms=${elapsed}`);
    return new Response(`ERRO: erro interno (${(e as Error).message})`, { status: 500, headers: textHeaders });
  }
});
