import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function notaRecencia(diasDesdeUltima: number): number {
  if (diasDesdeUltima <= 15) return 5;
  if (diasDesdeUltima <= 30) return 4;
  if (diasDesdeUltima <= 90) return 3;
  if (diasDesdeUltima <= 180) return 2;
  return 1;
}

function notaFrequencia(qtd: number): number {
  if (qtd > 4) return 5;
  if (qtd === 4) return 4;
  if (qtd === 3) return 3;
  if (qtd === 2) return 2;
  if (qtd === 1) return 1;
  return 1;
}

function notaValor(ticketMedio: number): number {
  if (ticketMedio > 400) return 5;
  if (ticketMedio > 300) return 4;
  if (ticketMedio > 200) return 3;
  if (ticketMedio > 100) return 2;
  return 1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let tenantFilter: string | null = null;
    try {
      const body = await req.json();
      if (body?.tenant_id) tenantFilter = body.tenant_id;
    } catch {
      // sem body, processa todos
    }

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    const cutoffISO = cutoff.toISOString();
    const agora = new Date();
    const agoraISO = agora.toISOString();

    // Get tenants to process
    let tenantsQuery = supabase.from("tenants").select("id");
    if (tenantFilter) tenantsQuery = tenantsQuery.eq("id", tenantFilter);
    const { data: tenants, error: tenantsErr } = await tenantsQuery;
    if (tenantsErr) throw tenantsErr;

    const resultados: Array<{ tenant_id: string; atualizados: number }> = [];

    for (const tenant of tenants || []) {
      // Pega TODAS as compras dos últimos 12 meses por contato
      const { data: compras, error: comprasErr } = await supabase
        .from("compras")
        .select("contato_id, valor, created_at")
        .eq("tenant_id", tenant.id)
        .gte("created_at", cutoffISO);

      if (comprasErr) {
        console.error(`Erro buscando compras tenant ${tenant.id}:`, comprasErr);
        continue;
      }

      // Agrupa por contato
      const porContato = new Map<
        string,
        { qtd: number; total: number; ultima: number }
      >();
      for (const c of compras || []) {
        const ts = new Date(c.created_at).getTime();
        const valor = Number(c.valor) || 0;
        const cur = porContato.get(c.contato_id);
        if (cur) {
          cur.qtd += 1;
          cur.total += valor;
          if (ts > cur.ultima) cur.ultima = ts;
        } else {
          porContato.set(c.contato_id, { qtd: 1, total: valor, ultima: ts });
        }
      }

      // Pega todos os contatos do tenant
      const { data: contatos, error: contatosErr } = await supabase
        .from("contatos")
        .select("id")
        .eq("tenant_id", tenant.id);

      if (contatosErr) {
        console.error(`Erro buscando contatos tenant ${tenant.id}:`, contatosErr);
        continue;
      }

      let atualizados = 0;
      for (const contato of contatos || []) {
        const stats = porContato.get(contato.id);
        let r: number, f: number | null, v: number | null;
        if (!stats) {
          r = 1;
          f = null;
          v = null;
        } else {
          const dias = Math.floor(
            (agora.getTime() - stats.ultima) / (1000 * 60 * 60 * 24),
          );
          r = notaRecencia(dias);
          f = notaFrequencia(stats.qtd);
          v = notaValor(stats.total / stats.qtd);
        }

        const { error: upErr } = await supabase
          .from("contatos")
          .update({
            rfv_recencia: r,
            rfv_frequencia: f,
            rfv_valor: v,
            rfv_calculado_em: agoraISO,
          })
          .eq("id", contato.id);

        if (!upErr) atualizados += 1;
      }

      resultados.push({ tenant_id: tenant.id, atualizados });
    }

    return new Response(
      JSON.stringify({ ok: true, resultados }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("Erro calcular-rfv:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
