// Endpoint público para integração com Blinkchat
// GET /blinkchat-produto?id=1&tenant=<uuid>
// Retorna texto simples no formato: "Descrição - R$ 50,00 - disponivel"
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const idParam = url.searchParams.get("id");
    const tenantParam = url.searchParams.get("tenant");

    if (!idParam) {
      return new Response("Erro: parâmetro 'id' é obrigatório", { status: 400, headers: textHeaders });
    }

    const numero = parseInt(idParam, 10);
    if (!Number.isFinite(numero) || numero < 1) {
      return new Response("Erro: 'id' inválido", { status: 400, headers: textHeaders });
    }

    if (!tenantParam) {
      return new Response("Erro: parâmetro 'tenant' é obrigatório", { status: 400, headers: textHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("chamado_denis_itens")
      .select("numero, descricao, valor, status, abacate_url")
      .eq("tenant_id", tenantParam)
      .eq("numero", numero)
      .maybeSingle();

    if (error) {
      console.error("DB error:", error);
      return new Response("Erro ao consultar produto", { status: 500, headers: textHeaders });
    }

    if (!data) {
      return new Response(`Produto ${numero} não encontrado`, { status: 404, headers: textHeaders });
    }

    const desc = (data.descricao || "").trim() || "(slot vazio)";
    const valor = formatBRL(Number(data.valor || 0));
    const status = data.status || "disponivel";
    const linkPart = data.abacate_url ? ` - ${data.abacate_url}` : "";

    const body = `${data.numero} - ${desc} - R$ ${valor} - ${status}${linkPart}`;
    return new Response(body, { status: 200, headers: textHeaders });
  } catch (e) {
    console.error("Unexpected error:", e);
    return new Response("Erro interno", { status: 500, headers: textHeaders });
  }
});
