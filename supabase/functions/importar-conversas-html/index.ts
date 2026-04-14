import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedMessage {
  timestamp: string;
  remetente: "contato" | "atendente";
  conteudo: string;
  tipo: "texto" | "imagem" | "audio" | "video" | "documento";
  atendente_nome?: string;
  media_filename?: string;
}

function normalizeTelefone(raw: string): string {
  return raw.replace(/\D/g, "");
}

function detectMediaType(filename: string): "imagem" | "audio" | "video" | "documento" {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".gif") || lower.endsWith(".webp")) return "imagem";
  if (lower.endsWith(".m4a") || lower.endsWith(".ogg") || lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".opus")) return "audio";
  if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".avi") || lower.startsWith("video")) return "video";
  if (lower.endsWith(".pdf") || lower.endsWith(".doc") || lower.endsWith(".docx") || lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "documento";
  // Detect by prefix patterns from Wondershare
  if (/^video\d/i.test(filename)) return "video";
  if (/^unknown\d/i.test(filename)) return "documento"; // stickers
  return "documento";
}

function mediaPlaceholder(tipo: string): string {
  switch (tipo) {
    case "imagem": return "[Imagem]";
    case "audio": return "[Áudio]";
    case "video": return "[Vídeo]";
    default: return "[Documento]";
  }
}

// Wondershare icon files to ignore
const ICON_FILES = new Set([
  "iconaudio.png", "iconpdf.png", "iconvideo.png", "iconfile.png",
  "iconword.png", "iconexcel.png", "iconppt.png", "iconcontact.png",
  "iconlocation.png", "iconimage.png",
]);

function isIconFile(filename: string): boolean {
  return ICON_FILES.has(filename.toLowerCase()) || /^icon[a-z]+\.(png|jpg)$/i.test(filename);
}

function parseWondershareHtml(html: string): { telefone: string; mensagens: ParsedMessage[] } | null {
  // Extract phone from <h3>
  const h3Match = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  if (!h3Match) return null;
  const phoneMatch = h3Match[1].match(/\+?\d[\d\s\-().]+/);
  if (!phoneMatch) return null;
  const telefone = normalizeTelefone(phoneMatch[0]);
  if (!telefone || telefone.length < 8) return null;

  const mensagens: ParsedMessage[] = [];
  let currentTimestamp: string | null = null;

  // Split by date markers
  const dateRegex = /<p\s+class=['"]date['"][^>]*>[\s\S]*?<font[^>]*>(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})<\/font>[\s\S]*?<\/p>/gi;
  
  // Collect all date positions
  const dates: { index: number; timestamp: string }[] = [];
  let dateMatch;
  while ((dateMatch = dateRegex.exec(html)) !== null) {
    const ts = dateMatch[1].replace(/\//g, "-").replace(" ", "T") + ":00-03:00";
    dates.push({ index: dateMatch.index, timestamp: ts });
  }

  for (let d = 0; d < dates.length; d++) {
    currentTimestamp = dates[d].timestamp;
    const start = dates[d].index;
    const end = d + 1 < dates.length ? dates[d + 1].index : html.length;
    const section = html.substring(start, end);

    // Find text messages: <p class='triangle-isosceles'> (received) or <p class='triangle-isosceles2'> (sent)
    const msgRegex = /<p\s+class=['"]triangle-isosceles2?['"][^>]*>([\s\S]*?)<\/p>/gi;
    let msgMatch;
    while ((msgMatch = msgRegex.exec(section)) !== null) {
      const isSent = /triangle-isosceles2/i.test(msgMatch[0]);
      let content = msgMatch[1];
      
      // Remove HTML tags but preserve line breaks
      content = content.replace(/<br\s*\/?>/gi, "\n");
      content = content.replace(/<[^>]+>/g, "").trim();
      
      // Detect agent name pattern: *NAME:*
      let atendente_nome: string | undefined;
      if (isSent) {
        const agentMatch = content.match(/^\*(.+?):\*\n?/);
        if (agentMatch) {
          atendente_nome = agentMatch[1];
          content = content.replace(agentMatch[0], "").trim();
        }
      }

      // Decode HTML entities
      content = content.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");

      if (!content) continue;

      mensagens.push({
        timestamp: currentTimestamp,
        remetente: isSent ? "atendente" : "contato",
        conteudo: content,
        tipo: "texto",
        atendente_nome,
      });
    }

    // Find media messages: <table class='triangle-isosceles-map'> or 'map2'
    const mediaRegex = /<table\s+class=['"](?:triangle-isosceles-map2?|map2?)['"][^>]*>([\s\S]*?)<\/table>/gi;
    let mediaMatch;
    while ((mediaMatch = mediaRegex.exec(section)) !== null) {
      const tableContent = mediaMatch[1];
      const isSent = /map2/i.test(mediaMatch[0]);

      // Extract href filename
      const hrefMatch = tableContent.match(/<a\s+href=['"](?:file:\/\/\/)?[^'"]*?([^/\\'"]+)['"][^>]*>/i);
      if (!hrefMatch) continue;

      const filename = decodeURIComponent(hrefMatch[1]);
      if (isIconFile(filename)) continue;

      // Check if it's a thumbnail (skip if there's a non-thumbnail version)
      if (/^thumb_/i.test(filename)) continue;

      const mediaTipo = detectMediaType(filename);

      // Detect agent name from text before media in same section
      let atendente_nome: string | undefined;
      if (isSent) {
        const agentInTable = tableContent.match(/\*(.+?):\*/);
        if (agentInTable) atendente_nome = agentInTable[1];
      }

      mensagens.push({
        timestamp: currentTimestamp,
        remetente: isSent ? "atendente" : "contato",
        conteudo: mediaPlaceholder(mediaTipo),
        tipo: mediaTipo,
        atendente_nome,
        media_filename: filename,
      });
    }
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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: profile } = await adminClient
      .from("profiles").select("tenant_id").eq("id", userId).single();
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "Tenant não encontrado" }), { status: 400, headers: corsHeaders });
    }
    const tenantId = profile.tenant_id;

    const body = await req.json();
    const { content, filename } = body;

    if (!content || typeof content !== "string") {
      return new Response(JSON.stringify({ error: "Conteúdo HTML é obrigatório" }), { status: 400, headers: corsHeaders });
    }

    const parsed = parseWondershareHtml(content);
    if (!parsed || !parsed.telefone) {
      return new Response(JSON.stringify({ error: "Não foi possível parsear o HTML. Formato inválido." }), { status: 400, headers: corsHeaders });
    }

    if (parsed.mensagens.length > 10000) {
      return new Response(JSON.stringify({ error: "Limite de 10000 mensagens por arquivo excedido" }), { status: 400, headers: corsHeaders });
    }

    const { telefone, mensagens } = parsed;

    // Find or create contato
    let { data: contato } = await adminClient
      .from("contatos").select("id, nome").eq("tenant_id", tenantId).eq("telefone", telefone).maybeSingle();

    if (!contato) {
      const last8 = telefone.slice(-8);
      const { data: partialMatch } = await adminClient
        .from("contatos").select("id, nome").eq("tenant_id", tenantId).ilike("telefone", `%${last8}`).maybeSingle();

      if (partialMatch) {
        contato = partialMatch;
      } else {
        const nomeFromFile = filename?.replace(/\.html?$/i, "").replace(/[_+]/g, " ").trim() || telefone;
        const { data: newContato, error: createErr } = await adminClient
          .from("contatos").insert({ tenant_id: tenantId, nome: nomeFromFile, telefone }).select("id, nome").single();
        if (createErr) {
          return new Response(JSON.stringify({ error: "Erro ao criar contato: " + createErr.message }), { status: 500, headers: corsHeaders });
        }
        contato = newContato;
      }
    }

    // Find or create conversa
    let { data: conversa } = await adminClient
      .from("conversas").select("id").eq("tenant_id", tenantId).eq("contato_id", contato.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (!conversa) {
      const { data: newConversa, error: convErr } = await adminClient
        .from("conversas").insert({
          tenant_id: tenantId, contato_id: contato.id, status: "aberta",
          ultima_msg_at: mensagens.length > 0 ? mensagens[mensagens.length - 1].timestamp : new Date().toISOString(),
        }).select("id").single();
      if (convErr) {
        return new Response(JSON.stringify({ error: "Erro ao criar conversa: " + convErr.message }), { status: 500, headers: corsHeaders });
      }
      conversa = newConversa;
    }

    // Build dedup set
    const existingKeys = new Set<string>();
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: existing } = await adminClient
        .from("mensagens").select("created_at, conteudo")
        .eq("conversa_id", conversa!.id).eq("tenant_id", tenantId)
        .contains("metadata", { importado: true })
        .range(from, from + pageSize - 1);
      if (!existing || existing.length === 0) break;
      for (const m of existing) {
        existingKeys.add(`${new Date(m.created_at).toISOString()}|${m.conteudo}`);
      }
      if (existing.length < pageSize) break;
      from += pageSize;
    }

    // Insert messages
    let totalInserted = 0;
    let totalDuplicadas = 0;
    const pendingMedia: string[] = [];
    const chunkSize = 500;

    for (let i = 0; i < mensagens.length; i += chunkSize) {
      const chunk = mensagens.slice(i, i + chunkSize)
        .map((m) => {
          const metadata: Record<string, any> = { importado: true };
          if (m.atendente_nome) metadata.senderName = m.atendente_nome;
          if (m.media_filename) {
            metadata.media_filename = m.media_filename;
            metadata.media_status = "pending";
          }
          return {
            conversa_id: conversa!.id,
            tenant_id: tenantId,
            conteudo: m.conteudo,
            remetente: m.remetente,
            tipo: m.tipo,
            created_at: m.timestamp,
            metadata,
          };
        })
        .filter((row) => {
          const key = `${new Date(row.created_at).toISOString()}|${row.conteudo}`;
          if (existingKeys.has(key)) { totalDuplicadas++; return false; }
          existingKeys.add(key);
          return true;
        });

      // Collect pending media filenames
      for (const row of chunk) {
        if (row.metadata.media_filename) pendingMedia.push(row.metadata.media_filename);
      }

      if (chunk.length === 0) continue;
      const { error: insertErr } = await adminClient.from("mensagens").insert(chunk);
      if (insertErr) {
        console.error("Batch insert error:", insertErr);
        return new Response(JSON.stringify({ error: "Erro ao inserir mensagens", detail: insertErr.message }), { status: 500, headers: corsHeaders });
      }
      totalInserted += chunk.length;
    }

    // Update conversa
    if (mensagens.length > 0) {
      const last = mensagens[mensagens.length - 1];
      await adminClient.from("conversas").update({
        ultimo_texto: last.conteudo.slice(0, 90),
        ultima_msg_at: last.timestamp,
      }).eq("id", conversa!.id);
    }

    return new Response(JSON.stringify({
      success: true,
      contato_nome: contato.nome,
      contato_id: contato.id,
      conversa_id: conversa!.id,
      total_mensagens: totalInserted,
      total_duplicadas: totalDuplicadas,
      total_midias_pendentes: pendingMedia.length,
      midias_pendentes: pendingMedia,
      telefone,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("importar-conversas-html error:", err);
    return new Response(JSON.stringify({ error: "Erro interno: " + (err as Error).message }), {
      status: 500, headers: corsHeaders,
    });
  }
});
