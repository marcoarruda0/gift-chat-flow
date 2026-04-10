import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pergunta, tenant_id } = await req.json();

    if (!pergunta || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "pergunta e tenant_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch active knowledge base articles for this tenant
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: artigos, error: dbError } = await supabase
      .from("conhecimento_base")
      .select("titulo, conteudo, categoria")
      .eq("tenant_id", tenant_id)
      .eq("ativo", true);

    if (dbError) {
      console.error("DB error:", dbError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar base de conhecimento" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!artigos || artigos.length === 0) {
      return new Response(
        JSON.stringify({
          resposta: "Não encontrei informações na base de conhecimento para responder esta pergunta.",
          fontes: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context from articles
    const contexto = artigos
      .map((a, i) => `[${i + 1}] ${a.titulo} (${a.categoria})\n${a.conteudo}`)
      .join("\n\n---\n\n");

    const systemPrompt = `Você é um assistente virtual de atendimento ao cliente. Use APENAS as informações da base de conhecimento abaixo para responder. Se a pergunta não puder ser respondida com as informações disponíveis, diga educadamente que não tem essa informação e sugira entrar em contato com um atendente.

Seja cordial, objetivo e use linguagem natural em português brasileiro. Não invente informações.

BASE DE CONHECIMENTO:
${contexto}`;

    // Call Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: pergunta },
          ],
        }),
      }
    );

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await aiResponse.text();
      console.error("AI error:", status, errText);
      return new Response(
        JSON.stringify({ error: "Erro ao consultar IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const resposta = aiData.choices?.[0]?.message?.content || "Sem resposta.";
    const fontes = artigos.map((a) => a.titulo);

    return new Response(
      JSON.stringify({ resposta, fontes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-responder error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
