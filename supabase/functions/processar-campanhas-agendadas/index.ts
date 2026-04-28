import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const nowIso = new Date().toISOString();

  // Busca campanhas agendadas com agendada_para <= now
  const { data: campanhas, error } = await supabase
    .from("campanhas")
    .select("id, canal, tenant_id, nome, agendada_para")
    .eq("status", "agendada")
    .lte("agendada_para", nowIso)
    .limit(50);

  if (error) {
    console.error("[scheduler] erro buscando campanhas:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resultados: any[] = [];

  for (const c of campanhas || []) {
    try {
      // Marca como enviando para evitar reprocessamento
      const { error: updErr } = await supabase
        .from("campanhas")
        .update({ status: "enviando" })
        .eq("id", c.id)
        .eq("status", "agendada"); // proteção concorrência

      if (updErr) {
        console.error(`[scheduler] falha ao marcar ${c.id}:`, updErr);
        resultados.push({ id: c.id, ok: false, erro: updErr.message });
        continue;
      }

      const fnName = c.canal === "whatsapp_cloud" ? "enviar-campanha-cloud" : "enviar-campanha";
      const fnUrl = `${supabaseUrl}/functions/v1/${fnName}`;

      // dispara sem aguardar
      fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ campanha_id: c.id, internal: true }),
      }).catch((err) => console.error(`[scheduler] disparo falhou ${c.id}:`, err));

      resultados.push({ id: c.id, ok: true, fn: fnName });
      console.log(`[scheduler] disparou ${c.id} via ${fnName} (agendada para ${c.agendada_para})`);
    } catch (err) {
      console.error(`[scheduler] erro ${c.id}:`, err);
      resultados.push({ id: c.id, ok: false, erro: (err as Error).message });
    }
  }

  return new Response(
    JSON.stringify({ processadas: resultados.length, resultados, ts: nowIso }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
