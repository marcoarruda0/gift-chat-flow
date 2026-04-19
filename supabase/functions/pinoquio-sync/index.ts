import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PinoquioCadastramento {
  id: number;
  id_external: string;
  fornecedor_name: string;
  fornecedor_telefone: string | null;
  fornecedor_cpf_cnpj: string | null;
  qty_total: number;
  vl_total_fornecedor_pix: number;
  vl_total_fornecedor_consignacao: number;
  limit_date: string;
  is_products_approved_by_fornecedor: boolean;
  acquisition_type_choosed: string | null;
  status_id: string;
  store_id: number;
  created_at: string;
}

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function applyTemplate(template: string, cad: PinoquioCadastramento, link: string): string {
  const limitDate = cad.limit_date ? new Date(cad.limit_date).toLocaleDateString("pt-BR") : "—";
  return template
    .replace(/\{id\}/g, String(cad.id))
    .replace(/\{link\}/g, link)
    .replace(/\{fornecedor_name\}/g, cad.fornecedor_name || "")
    .replace(/\{qty_total\}/g, String(cad.qty_total || 0))
    .replace(/\{valor_pix\}/g, String(cad.vl_total_fornecedor_pix || 0))
    .replace(/\{valor_consignacao\}/g, String(cad.vl_total_fornecedor_consignacao || 0))
    .replace(/\{data_limite\}/g, limitDate);
}

function sanitizeToken(raw: string): string {
  let clean = raw.trim();
  // Remove surrounding quotes
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1);
  }
  // Remove "Bearer " prefix if accidentally included
  if (/^Bearer\s+/i.test(clean)) {
    clean = clean.replace(/^Bearer\s+/i, "");
  }
  // Remove whitespace/newlines
  clean = clean.replace(/\s+/g, "");
  return clean;
}

function buildPinoquioHeaders(token: string, storeId: string): Record<string, string> {
  return {
    "accept": "application/json",
    "authorization": token,
    "content-type": "application/json",
    "store-id": storeId,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro interno";
}

async function fetchAllPages(apiBaseUrl: string, rawToken: string, storeId: string): Promise<PinoquioCadastramento[]> {
  const token = sanitizeToken(rawToken);
  if (!token) throw new Error("Token vazio");

  const all: PinoquioCadastramento[] = [];
  let page = 1;
  let lastPage = 1;

  do {
    const url = `${apiBaseUrl}/collections/registration-parts?step_id=registro_de_pecas&status_id=aguardando_fornecedor&page=${page}&perPage=50&qtyBoxes=0&aquisitionTypes=`;
    const res = await fetch(url, {
      headers: buildPinoquioHeaders(token, storeId),
    });

    if (res.status === 401) {
      throw new Error("Token recusado pela API Pinóquio (401). Verifique se o token está correto e não expirou.");
    }
    if (!res.ok) {
      throw new Error(`Pinóquio API error: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    lastPage = json.last_page || 1;
    if (json.data && Array.isArray(json.data)) {
      all.push(...json.data);
    }
    page++;
  } while (page <= lastPage);

  return all;
}

async function registerInConversas(
  client: ReturnType<typeof createClient>,
  tenantId: string,
  phone: string,
  nome: string,
  message: string,
  cadastramentoId: number
) {
  try {
    // 1. Find or create contact (atômico, tolerante a duplicatas/race)
    let { data: contato } = await client
      .from("contatos")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("telefone", phone)
      .maybeSingle();

    if (!contato) {
      const { data: novo, error: insertErr } = await client
        .from("contatos")
        .insert({ tenant_id: tenantId, telefone: phone, nome: nome || "Fornecedor" })
        .select("id")
        .maybeSingle();
      if (novo) {
        contato = novo;
      } else if (insertErr && (insertErr.code === "23505" || /duplicate|unique/i.test(insertErr.message || ""))) {
        const { data: retry } = await client
          .from("contatos").select("id")
          .eq("tenant_id", tenantId).eq("telefone", phone).maybeSingle();
        contato = retry;
      }
    }
    if (!contato) return;

    // 2. Find or create conversation
    let { data: conversa } = await client
      .from("conversas")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("contato_id", contato.id)
      .neq("status", "fechada")
      .limit(1)
      .single();

    if (!conversa) {
      const { data: nova } = await client
        .from("conversas")
        .insert({ tenant_id: tenantId, contato_id: contato.id, status: "aberta" })
        .select("id")
        .single();
      conversa = nova;
    }
    if (!conversa) return;

    const now = new Date().toISOString();

    // 3. Insert message
    await client.from("mensagens").insert({
      tenant_id: tenantId,
      conversa_id: conversa.id,
      conteudo: message,
      remetente: "atendente",
      tipo: "texto",
      metadata: { origem: "pinoquio", cadastramento_id: cadastramentoId },
    });

    // 4. Update conversation
    await client.from("conversas").update({
      ultimo_texto: message.substring(0, 200),
      ultima_msg_at: now,
    }).eq("id", conversa.id);
  } catch (e) {
    console.error("registerInConversas error:", e);
  }
}

async function sendViaZapi(
  instanceId: string,
  token: string,
  clientToken: string,
  phone: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify({ phone, message }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: JSON.stringify(data) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function processTenant(
  serviceClient: ReturnType<typeof createClient>,
  tenantId: string,
  config: any,
  zapiConfig: any,
  specificIds?: number[],
  forceResend?: boolean
) {
  const stats = { total_pendentes: 0, total_novos_enviados: 0, total_erros: 0, total_ignorados: 0 };

  let cadastramentos: PinoquioCadastramento[];
  try {
    cadastramentos = await fetchAllPages(config.api_base_url, config.jwt_token, config.store_id || "32");
  } catch (e) {
    console.error(`Error fetching Pinóquio for tenant ${tenantId}:`, e);
    await serviceClient.from("pinoquio_execucoes").insert({
      tenant_id: tenantId,
      total_pendentes: 0,
      total_novos_enviados: 0,
      total_erros: 1,
      total_ignorados: 0,
    });
    return { error: e.message, stats };
  }

  if (specificIds && specificIds.length > 0) {
    cadastramentos = cadastramentos.filter((c) => specificIds.includes(c.id));
  }

  stats.total_pendentes = cadastramentos.length;

  const existingIds = specificIds && forceResend
    ? []
    : (await serviceClient
        .from("pinoquio_notificacoes")
        .select("cadastramento_id")
        .eq("tenant_id", tenantId)
        .in("status", ["enviado", "pendente"])
      ).data?.map((n: any) => n.cadastramento_id) || [];

  for (const cad of cadastramentos) {
    if (cad.is_products_approved_by_fornecedor === true) {
      stats.total_ignorados++;
      continue;
    }
    if (cad.acquisition_type_choosed != null) {
      stats.total_ignorados++;
      continue;
    }

    if (!forceResend && existingIds.includes(cad.id)) {
      stats.total_ignorados++;
      continue;
    }

    const link = `https://pinoquio.pecararabrecho.com.br/external/fornecedor/${cad.id_external}/confirmacao-produtos?origin=link`;
    const lote = `R-${cad.id}`;
    const phone = formatPhone(cad.fornecedor_telefone);

    if (!phone) {
      await serviceClient.from("pinoquio_notificacoes").upsert(
        {
          tenant_id: tenantId,
          cadastramento_id: cad.id,
          cadastramento_id_external: cad.id_external,
          fornecedor_nome: cad.fornecedor_name,
          fornecedor_telefone: cad.fornecedor_telefone,
          lote,
          link_aprovacao: link,
          status: "sem_telefone",
          erro_mensagem: "Fornecedor sem telefone cadastrado",
        },
        { onConflict: "tenant_id,cadastramento_id" }
      );
      stats.total_ignorados++;
      continue;
    }

    const message = applyTemplate(config.template_mensagem, cad, link);

    const result = await sendViaZapi(
      zapiConfig.instance_id,
      zapiConfig.token,
      zapiConfig.client_token,
      phone,
      message
    );

    await serviceClient.from("pinoquio_notificacoes").upsert(
      {
        tenant_id: tenantId,
        cadastramento_id: cad.id,
        cadastramento_id_external: cad.id_external,
        fornecedor_nome: cad.fornecedor_name,
        fornecedor_telefone: cad.fornecedor_telefone,
        lote,
        link_aprovacao: link,
        mensagem_enviada: message,
        status: result.ok ? "enviado" : "erro",
        erro_mensagem: result.error || null,
        enviado_at: result.ok ? new Date().toISOString() : null,
      },
      { onConflict: "tenant_id,cadastramento_id" }
    );

    if (result.ok) {
      stats.total_novos_enviados++;
      await registerInConversas(serviceClient, tenantId, phone, cad.fornecedor_name, message, cad.id);
    } else {
      stats.total_erros++;
    }
  }

  await serviceClient.from("pinoquio_execucoes").insert({
    tenant_id: tenantId,
    total_pendentes: stats.total_pendentes,
    total_novos_enviados: stats.total_novos_enviados,
    total_erros: stats.total_erros,
    total_ignorados: stats.total_ignorados,
  });

  return { stats };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body = cron call
    }

    const { tenant_id, cadastramento_ids, force_resend, action } = body;

    // Action: test_connection
    if (action === "test_connection" && tenant_id) {
      let tokenRaw = body.jwt_token;
      let apiBaseUrl = body.api_base_url;
      let storeId = body.store_id;

      if (!tokenRaw || !apiBaseUrl) {
        const { data: config } = await serviceClient
          .from("pinoquio_config")
          .select("*")
          .eq("tenant_id", tenant_id)
          .single();
        if (!tokenRaw) tokenRaw = config?.jwt_token;
        if (!apiBaseUrl) apiBaseUrl = config?.api_base_url;
        if (!storeId) storeId = config?.store_id;
      }

      if (!storeId) storeId = "32";

      if (!tokenRaw) {
        return new Response(
          JSON.stringify({ ok: false, error: "Token não configurado. Salve a configuração primeiro." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const token = sanitizeToken(tokenRaw);
      if (!token) {
        return new Response(
          JSON.stringify({ ok: false, error: "Token vazio após limpeza" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const url = `${apiBaseUrl}/collections/registration-parts?step_id=registro_de_pecas&status_id=aguardando_fornecedor&page=1&perPage=1&qtyBoxes=0&aquisitionTypes=`;
        const res = await fetch(url, {
          headers: buildPinoquioHeaders(token, storeId),
        });
        if (res.status === 401) {
          return new Response(
            JSON.stringify({ ok: false, error: "Token recusado pela API Pinóquio (401). Verifique se o token está correto e não expirou." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!res.ok) {
          const text = await res.text();
          return new Response(
            JSON.stringify({ ok: false, error: `HTTP ${res.status}: ${text}` }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const data = await res.json();
        return new Response(
          JSON.stringify({ ok: true, total: data.total || 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ ok: false, error: e.message }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Action: fetch_pendentes
    if (action === "fetch_pendentes" && tenant_id) {
      const { data: config } = await serviceClient
        .from("pinoquio_config")
        .select("*")
        .eq("tenant_id", tenant_id)
        .single();

      if (!config?.jwt_token) {
        return new Response(
          JSON.stringify({ error: "Token não configurado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const cadastramentos = await fetchAllPages(config.api_base_url, config.jwt_token, config.store_id || "32");

        const { data: notifs } = await serviceClient
          .from("pinoquio_notificacoes")
          .select("cadastramento_id, status, enviado_at")
          .eq("tenant_id", tenant_id);

        const notifMap = new Map((notifs || []).map((n: any) => [n.cadastramento_id, n]));

        const enriched = cadastramentos.map((c) => ({
          ...c,
          notificacao: notifMap.get(c.id) || null,
        }));

        return new Response(JSON.stringify({ ok: true, data: enriched }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ ok: false, error: getErrorMessage(error) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Process specific tenant
    if (tenant_id) {
      const { data: config } = await serviceClient
        .from("pinoquio_config")
        .select("*")
        .eq("tenant_id", tenant_id)
        .single();

      if (!config) {
        return new Response(
          JSON.stringify({ error: "Configuração Pinóquio não encontrada" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: zapiConfig } = await serviceClient
        .from("zapi_config")
        .select("instance_id, token, client_token")
        .eq("tenant_id", tenant_id)
        .single();

      if (!zapiConfig) {
        return new Response(
          JSON.stringify({ error: "Z-API não configurada para este tenant" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await processTenant(
        serviceClient,
        tenant_id,
        config,
        zapiConfig,
        cadastramento_ids,
        force_resend
      );

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cron mode
    const { data: activeConfigs } = await serviceClient
      .from("pinoquio_config")
      .select("*")
      .eq("polling_ativo", true);

    if (!activeConfigs || activeConfigs.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhum tenant com polling ativo" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: any[] = [];

    for (const config of activeConfigs) {
      const { data: zapiConfig } = await serviceClient
        .from("zapi_config")
        .select("instance_id, token, client_token")
        .eq("tenant_id", config.tenant_id)
        .single();

      if (!zapiConfig) {
        console.warn(`Tenant ${config.tenant_id} has no Z-API config, skipping`);
        continue;
      }

      const result = await processTenant(serviceClient, config.tenant_id, config, zapiConfig);
      results.push({ tenant_id: config.tenant_id, ...result });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("pinoquio-sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
