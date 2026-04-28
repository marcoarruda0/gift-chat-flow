import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function htmlPage(title: string, body: string, brandName: string) {
  return `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  body{margin:0;background:#f3f4f6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
  .card{background:#fff;max-width:440px;width:100%;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:32px;text-align:center}
  h1{margin:0 0 8px;font-size:22px;color:#111827}
  .brand{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:20px}
  p{color:#374151;line-height:1.55;font-size:15px;margin:12px 0}
  button{margin-top:18px;background:#1B4F72;color:#fff;border:0;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;width:100%}
  button.secondary{background:#e5e7eb;color:#111827;margin-top:8px}
  button:disabled{opacity:.6;cursor:wait}
  .ok{color:#047857}.err{color:#b91c1c}
</style></head><body><div class="card"><div class="brand">${brandName}</div>${body}</div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!token) {
    return new Response(htmlPage("Link inválido", `<h1>Link inválido</h1><p class="err">Este link de descadastro não é válido.</p>`, ""), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Buscar token + contato + tenant
  const { data: tk } = await supabase
    .from("optout_tokens")
    .select("id, tenant_id, contato_id, used_at, contatos:contato_id(nome, telefone, opt_out_whatsapp), tenants:tenant_id(nome)")
    .eq("token", token)
    .maybeSingle();

  if (!tk) {
    return new Response(htmlPage("Link inválido", `<h1>Link expirado ou inválido</h1><p class="err">Este link já não está mais ativo.</p>`, ""), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const brand = (tk as any).tenants?.nome || "Loja";
  const contato = (tk as any).contatos;
  const nome = contato?.nome || "";
  const tel = contato?.telefone || "";

  if (req.method === "GET") {
    if (contato?.opt_out_whatsapp) {
      return new Response(htmlPage("Já descadastrado", `
        <h1>Você já está descadastrado</h1>
        <p class="ok">${nome ? nome + ", v" : "V"}ocê não receberá mais mensagens promocionais de <b>${brand}</b> pelo WhatsApp.</p>
        <p>Caso tenha sido um engano, entre em contato com a loja.</p>
      `, brand), { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
    }

    return new Response(htmlPage("Confirmar descadastro", `
      <h1>Quer parar de receber mensagens?</h1>
      <p>Olá${nome ? `, <b>${nome}</b>` : ""}. Confirme abaixo para parar de receber mensagens promocionais de <b>${brand}</b> no WhatsApp ${tel ? `(${tel})` : ""}.</p>
      <form method="POST"><button type="submit">Confirmar descadastro</button></form>
      <p style="font-size:12px;color:#9ca3af;margin-top:18px">Após confirmar, você ainda poderá receber mensagens de atendimento iniciadas por você.</p>
    `, brand), { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
  }

  if (req.method === "POST") {
    // Marca contato como opt-out
    await supabase
      .from("contatos")
      .update({ opt_out_whatsapp: true, opt_out_at: new Date().toISOString() })
      .eq("id", tk.contato_id)
      .eq("tenant_id", tk.tenant_id);

    if (!tk.used_at) {
      await supabase
        .from("optout_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", tk.id);
    }

    return new Response(htmlPage("Descadastrado", `
      <h1>Descadastrado com sucesso</h1>
      <p class="ok">Pronto! Você não receberá mais mensagens promocionais de <b>${brand}</b> no WhatsApp.</p>
      <p>Se mudar de ideia, é só responder uma mensagem da loja pedindo para voltar a receber.</p>
    `, brand), { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
  }

  return new Response("Método não suportado", { status: 405, headers: corsHeaders });
});
