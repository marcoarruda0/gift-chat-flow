// Job de expiração em lote de giftbacks vencidos.
// Roda via pg_cron diariamente. Pode ser invocado manualmente para teste.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const hoje = new Date().toISOString().split("T")[0];
    const startedAt = new Date().toISOString();

    let totalExpirados = 0;
    const contatosAfetados = new Set<string>();
    const BATCH = 1000;

    // Loop em batches para evitar transações gigantes
    while (true) {
      const { data: vencidos, error: selErr } = await supabase
        .from("giftback_movimentos")
        .select("id, contato_id")
        .eq("tipo", "credito")
        .eq("status", "ativo")
        .lt("validade", hoje)
        .limit(BATCH);

      if (selErr) throw selErr;
      if (!vencidos || vencidos.length === 0) break;

      const ids = vencidos.map((v) => v.id);
      vencidos.forEach((v) => contatosAfetados.add(v.contato_id));

      const { error: updErr } = await supabase
        .from("giftback_movimentos")
        .update({ status: "expirado", motivo_inativacao: "expirado" })
        .in("id", ids);

      if (updErr) throw updErr;
      totalExpirados += vencidos.length;

      // Se voltou menos que o batch, acabou
      if (vencidos.length < BATCH) break;
    }

    // Zerar saldo dos contatos afetados (regra: 1 ativo por cliente,
    // logo ao expirar o único ativo o saldo agregado vira 0)
    let contatosZerados = 0;
    if (contatosAfetados.size > 0) {
      const idsContatos = Array.from(contatosAfetados);
      // Atualiza em chunks de 500 para não estourar limites de query
      const CHUNK = 500;
      for (let i = 0; i < idsContatos.length; i += CHUNK) {
        const chunk = idsContatos.slice(i, i + CHUNK);
        const { error: cErr } = await supabase
          .from("contatos")
          .update({ saldo_giftback: 0 })
          .in("id", chunk);
        if (cErr) throw cErr;
        contatosZerados += chunk.length;
      }
    }

    const result = {
      ok: true,
      iniciado_em: startedAt,
      finalizado_em: new Date().toISOString(),
      data_corte: hoje,
      expirados: totalExpirados,
      contatos_zerados: contatosZerados,
    };

    console.log("[expirar-giftbacks]", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[expirar-giftbacks] ERRO:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
