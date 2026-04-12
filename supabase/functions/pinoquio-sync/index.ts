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

function cleanJwt(raw: string): { token: string; warnings: string[] } {
  const warnings: string[] = [];
  let clean = raw.trim();
  // Remove surrounding quotes
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1);
    warnings.push("Aspas removidas do token");
  }
  // Remove "Bearer " prefix
  if (/^Bearer\s+/i.test(clean)) {
    clean = clean.replace(/^Bearer\s+/i, "");
    warnings.push("Prefixo 'Bearer' removido do token");
  }
  // Remove whitespace/newlines
  clean = clean.replace(/\s+/g, "");
  // If it doesn't start with "eyJ" it might be base64-encoded
  if (!clean.startsWith("eyJ")) {
    try {
      const decoded = atob(clean);
      if (decoded.startsWith("eyJ")) {
        clean = decoded.replace(/\s+/g, "");
        warnings.push("Token decodificado de base64");
      }
    } catch { /* not base64, use as-is */ }
  }
  return { token: clean, warnings };
}

function validateJwtFormat(token: string): string | null {
  if (!token) return "Token vazio";
  if (!token.startsWith("eyJ")) return "Token não parece ser um JWT válido (deve começar com 'eyJ')";
  const parts = token.split(".");
  if (parts.length < 2) return "Token JWT malformado (esperado pelo menos 2 partes separadas por '.')";
  return null;
}

async function fetchAllPages(apiBaseUrl: string, rawJwt: string): Promise<PinoquioCadastramento[]> {
  const { token: jwt } = cleanJwt(rawJwt);
  const formatError = validateJwtFormat(jwt);
  if (formatError) throw new Error(formatError);

  const all: PinoquioCadastramento[] = [];
  let page = 1;
  let lastPage = 1;

  do {
    const url = `${apiBaseUrl}/collections/registration-parts?step_id=registro_de_pecas&status_id=aguardando_fornecedor&page=${page}&perPage=50&qtyBoxes=0&aquisitionTypes=`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
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
    cadastramentos = await fetchAllPages(config.api_base_url, config.jwt_token);
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

  // Filter by specific IDs if provided
  if (specificIds && specificIds.length > 0) {
    cadastramentos = cadastramentos.filter((c) => specificIds.includes(c.id));
  }

  stats.total_pendentes = cadastramentos.length;

  // Get existing notifications to avoid duplicates
  const existingIds = specificIds && forceResend
    ? []
    : (await serviceClient
        .from("pinoquio_notificacoes")
        .select("cadastramento_id")
        .eq("tenant_id", tenantId)
        .in("status", ["enviado", "pendente"])
      ).data?.map((n: any) => n.cadastramento_id) || [];

  for (const cad of cadastramentos) {
    // Skip if already approved or payment chosen
    if (cad.is_products_approved_by_fornecedor === true) {
      stats.total_ignorados++;
      continue;
    }
    if (cad.acquisition_type_choosed != null) {
      stats.total_ignorados++;
      continue;
    }

    // Skip if already notified (unless force resend)
    if (!forceResend && existingIds.includes(cad.id)) {
      stats.total_ignorados++;
      continue;
    }

    const link = `https://pinoquio.pecararabrecho.com.br/external/fornecedor/${cad.id_external}/confirmacao-produtos?origin=link`;
    const lote = `R-${cad.id}`;
    const phone = formatPhone(cad.fornecedor_telefone);

    // No phone
    if (!phone) {
      // Upsert notification as sem_telefone
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

    // Send via Z-API
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
    } else {
      stats.total_erros++;
    }
  }

  // Log execution
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
      // No body = cron call, process all active tenants
    }

    const { tenant_id, cadastramento_ids, force_resend, action } = body;

    // Action: test_connection — just test the Pinóquio API
    if (action === "test_connection" && tenant_id) {
      // Accept inline jwt/url from request body, fallback to DB
      let jwtRaw = body.jwt_token;
      let apiBaseUrl = body.api_base_url;

      if (!jwtRaw || !apiBaseUrl) {
        const { data: config } = await serviceClient
          .from("pinoquio_config")
          .select("*")
          .eq("tenant_id", tenant_id)
          .single();
        if (!jwtRaw) jwtRaw = config?.jwt_token;
        if (!apiBaseUrl) apiBaseUrl = config?.api_base_url;
      }

      if (!jwtRaw) {
        return new Response(
          JSON.stringify({ ok: false, error: "JWT não configurado. Salve a configuração primeiro." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { token: jwt, warnings } = cleanJwt(jwtRaw);
      const formatError = validateJwtFormat(jwt);
      if (formatError) {
        return new Response(
          JSON.stringify({ ok: false, error: formatError, warnings }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const url = `${apiBaseUrl}/collections/registration-parts?step_id=registro_de_pecas&status_id=aguardando_fornecedor&page=1&perPage=1&qtyBoxes=0&aquisitionTypes=`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        });
        if (res.status === 401) {
          const text = await res.text();
          return new Response(
            JSON.stringify({ ok: false, error: "Token recusado pela API Pinóquio (401). Verifique se o token está correto e não expirou.", warnings }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!res.ok) {
          const text = await res.text();
          return new Response(
            JSON.stringify({ ok: false, error: `HTTP ${res.status}: ${text}`, warnings }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const data = await res.json();
        return new Response(
          JSON.stringify({ ok: true, total: data.total || 0, warnings }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ ok: false, error: e.message, warnings }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Action: fetch_pendentes — just return the list without sending
    if (action === "fetch_pendentes" && tenant_id) {
      const { data: config } = await serviceClient
        .from("pinoquio_config")
        .select("*")
        .eq("tenant_id", tenant_id)
        .single();

      if (!config?.jwt_token) {
        return new Response(
          JSON.stringify({ error: "JWT não configurado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cadastramentos = await fetchAllPages(config.api_base_url, config.jwt_token);

      // Enrich with notification status
      const { data: notifs } = await serviceClient
        .from("pinoquio_notificacoes")
        .select("cadastramento_id, status, enviado_at")
        .eq("tenant_id", tenant_id);

      const notifMap = new Map((notifs || []).map((n: any) => [n.cadastramento_id, n]));

      const enriched = cadastramentos.map((c) => ({
        ...c,
        notificacao: notifMap.get(c.id) || null,
      }));

      return new Response(JSON.stringify({ data: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // Cron mode: process all active tenants
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
