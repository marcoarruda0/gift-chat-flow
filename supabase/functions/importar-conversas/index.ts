import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedMessage {
  timestamp: string;
  remetente: "contato" | "atendente";
  conteudo: string;
  atendente_nome?: string;
}

function normalizeTelefone(raw: string): string {
  return raw.replace(/\D/g, "");
}

function extractTelefoneFromHeader(line: string): string | null {
  // Match patterns like "iPhone(+55 11 99493-5647)" or just "+55 11 99493-5647"
  const match = line.match(/\+?\d[\d\s\-().]+/);
  if (!match) return null;
  return normalizeTelefone(match[0]);
}

function parseWondershareFile(content: string): { telefone: string; mensagens: ParsedMessage[] } | null {
  const lines = content.split("\n");
  if (lines.length < 3) return null;

  const telefone = extractTelefoneFromHeader(lines[0]);
  if (!telefone) return null;

  const mensagens: ParsedMessage[] = [];
  const timestampRegex = /^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})$/;

  let i = 2; // skip header + separator
  while (i < lines.length) {
    const line = lines[i].trim();
    const tsMatch = line.match(timestampRegex);
    if (!tsMatch) { i++; continue; }

    const timestamp = tsMatch[1]; // "2024/12/03 15:49"
    i++;
    if (i >= lines.length) break;

    const senderLine = lines[i].trim();
    i++;

    let remetente: "contato" | "atendente";
    let atendente_nome: string | undefined;

    if (/^\+?\d[\d\s\-]*:$/.test(senderLine)) {
      // Phone number = contato
      remetente = "contato";
    } else {
      // Company name = atendente
      remetente = "atendente";
      // Check next line for *Name:* pattern
      if (i < lines.length) {
        const possibleAgent = lines[i].trim();
        const agentMatch = possibleAgent.match(/^\*(.+?):\*$/);
        if (agentMatch) {
          atendente_nome = agentMatch[1];
          i++;
        }
      }
    }

    // Collect message content (multi-line until next timestamp or empty block)
    const contentLines: string[] = [];
    while (i < lines.length) {
      const nextLine = lines[i];
      // Check if next non-empty line is a timestamp (peek ahead)
      if (nextLine.trim() === "") {
        // Check if the line after empty is a timestamp
        if (i + 1 < lines.length && timestampRegex.test(lines[i + 1].trim())) {
          i++; // skip blank line
          break;
        }
        contentLines.push("");
        i++;
      } else if (timestampRegex.test(nextLine.trim())) {
        break;
      } else {
        contentLines.push(nextLine);
        i++;
      }
    }

    const conteudo = contentLines.join("\n").trim();
    if (!conteudo) continue;

    // Convert timestamp "2024/12/03 15:49" to ISO
    const isoTimestamp = timestamp.replace(/\//g, "-").replace(" ", "T") + ":00-03:00";

    mensagens.push({ timestamp: isoTimestamp, remetente, conteudo, atendente_nome });
  }

  return { telefone, mensagens };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user via getClaims
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Get tenant
    const { data: profile } = await adminClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .single();
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "Tenant não encontrado" }), { status: 400, headers: corsHeaders });
    }
    const tenantId = profile.tenant_id;

    const body = await req.json();
    const { content, filename } = body;

    if (!content || typeof content !== "string") {
      return new Response(JSON.stringify({ error: "Conteúdo do arquivo é obrigatório" }), { status: 400, headers: corsHeaders });
    }

    const parsed = parseWondershareFile(content);
    if (!parsed || !parsed.telefone) {
      return new Response(JSON.stringify({ error: "Não foi possível parsear o arquivo. Formato inválido." }), { status: 400, headers: corsHeaders });
    }

    if (parsed.mensagens.length > 5000) {
      return new Response(JSON.stringify({ error: "Limite de 5000 mensagens por arquivo excedido" }), { status: 400, headers: corsHeaders });
    }

    const { telefone, mensagens } = parsed;

    // Find or create contato
    let { data: contato } = await adminClient
      .from("contatos")
      .select("id, nome")
      .eq("tenant_id", tenantId)
      .eq("telefone", telefone)
      .maybeSingle();

    if (!contato) {
      // Try with partial match (last 8 digits)
      const last8 = telefone.slice(-8);
      const { data: partialMatch } = await adminClient
        .from("contatos")
        .select("id, nome")
        .eq("tenant_id", tenantId)
        .ilike("telefone", `%${last8}`)
        .maybeSingle();

      if (partialMatch) {
        contato = partialMatch;
      } else {
        // Create new contact
        const nomeFromFile = filename?.replace(/\.txt$/i, "").replace(/_/g, " ") || telefone;
        const { data: newContato, error: createErr } = await adminClient
          .from("contatos")
          .insert({ tenant_id: tenantId, nome: nomeFromFile, telefone })
          .select("id, nome")
          .single();
        if (createErr) {
          return new Response(JSON.stringify({ error: "Erro ao criar contato: " + createErr.message }), { status: 500, headers: corsHeaders });
        }
        contato = newContato;
      }
    }

    // Find or create conversa
    let { data: conversa } = await adminClient
      .from("conversas")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("contato_id", contato.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conversa) {
      const { data: newConversa, error: convErr } = await adminClient
        .from("conversas")
        .insert({
          tenant_id: tenantId,
          contato_id: contato.id,
          status: "aberta",
          ultima_msg_at: mensagens.length > 0 ? mensagens[mensagens.length - 1].timestamp : new Date().toISOString(),
        })
        .select("id")
        .single();
      if (convErr) {
        return new Response(JSON.stringify({ error: "Erro ao criar conversa: " + convErr.message }), { status: 500, headers: corsHeaders });
      }
      conversa = newConversa;
    }

    // Batch insert messages (in chunks of 500)
    let totalInserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < mensagens.length; i += chunkSize) {
      const chunk = mensagens.slice(i, i + chunkSize).map((m) => ({
        conversa_id: conversa!.id,
        tenant_id: tenantId,
        conteudo: m.conteudo,
        remetente: m.remetente,
        tipo: "texto" as const,
        created_at: m.timestamp,
        metadata: m.atendente_nome ? { senderName: m.atendente_nome, importado: true } : { importado: true },
      }));

      const { error: insertErr } = await adminClient.from("mensagens").insert(chunk);
      if (insertErr) {
        console.error("Batch insert error:", insertErr);
        return new Response(JSON.stringify({
          error: "Erro ao inserir mensagens",
          detail: insertErr.message,
          inserted_so_far: totalInserted,
        }), { status: 500, headers: corsHeaders });
      }
      totalInserted += chunk.length;
    }

    // Update conversa with last message info
    if (mensagens.length > 0) {
      const last = mensagens[mensagens.length - 1];
      await adminClient.from("conversas").update({
        ultimo_texto: last.conteudo.slice(0, 90),
        ultima_msg_at: last.timestamp,
      }).eq("id", conversa.id);
    }

    return new Response(JSON.stringify({
      success: true,
      contato_nome: contato.nome,
      contato_id: contato.id,
      conversa_id: conversa.id,
      total_mensagens: totalInserted,
      telefone,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("importar-conversas error:", err);
    return new Response(JSON.stringify({ error: "Erro interno: " + (err as Error).message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
