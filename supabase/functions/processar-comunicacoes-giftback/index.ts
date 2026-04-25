// Cron diário (executa a cada 15min) que dispara comunicações de giftback
// configuradas pelos tenants. Cada tenant escolhe seu horário; a função
// decide internamente quem deve rodar agora.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v21.0";
const TOLERANCIA_MIN = 7; // ±7 min em torno do horario_envio
const DELAY_MIN_MS = 500;
const DELAY_MAX_MS = 2000;

// ===== utils (espelham src/lib/giftback-comunicacao.ts) =====
const fmtBRL = (n: number | null | undefined) =>
  `R$ ${(Number(n) || 0).toFixed(2).replace(".", ",")}`;

const fmtData = (iso?: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
};

const diffDias = (alvoISO?: string | null, hojeISO?: string) => {
  if (!alvoISO) return "";
  const hoje = hojeISO ? new Date(hojeISO + "T00:00:00Z") : new Date();
  const alvo = new Date(alvoISO + "T00:00:00Z");
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000).toString();
};

function buildVarsMap(ctx: {
  contato: any;
  tenant: any;
  movimento: any;
  hojeISO: string;
}): Record<string, string> {
  return {
    nome_cliente: ctx.contato?.nome || "",
    nome_empresa: ctx.tenant?.nome || "",
    valor_giftback: fmtBRL(ctx.movimento?.valor),
    saldo_giftback: fmtBRL(ctx.contato?.saldo_giftback ?? 0),
    id_giftback: String(ctx.movimento?.id || "").slice(0, 8).toUpperCase(),
    data_vencimento: fmtData(ctx.movimento?.validade),
    dias_ate_expirar: diffDias(ctx.movimento?.validade, ctx.hojeISO),
  };
}

function resolverVariaveis(texto: string, vars: Record<string, string>): string {
  if (!texto) return "";
  return texto.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => vars[key] ?? "");
}

function extractMetaPlaceholders(text: string): number[] {
  const matches = (text || "").matchAll(/\{\{(\d+)\}\}/g);
  const nums = new Set<number>();
  for (const m of matches) nums.add(parseInt(m[1], 10));
  return Array.from(nums).sort((a, b) => a - b);
}

function montarComponents(
  templateComponents: any[],
  mapping: Record<string, string>,
  vars: Record<string, string>,
): any[] {
  const out: any[] = [];
  for (const comp of templateComponents || []) {
    const type = String(comp?.type || "").toUpperCase();
    if (type === "HEADER") {
      if (String(comp.format || "TEXT").toUpperCase() !== "TEXT") continue;
      const ph = extractMetaPlaceholders(comp.text || "");
      if (ph.length === 0) continue;
      out.push({
        type: "header",
        parameters: ph.map((n) => ({
          type: "text",
          text: resolverVariaveis(mapping[`header.${n}`] || "", vars),
        })),
      });
    } else if (type === "BODY") {
      const ph = extractMetaPlaceholders(comp.text || "");
      if (ph.length === 0) continue;
      out.push({
        type: "body",
        parameters: ph.map((n) => ({
          type: "text",
          text: resolverVariaveis(mapping[`body.${n}`] || "", vars),
        })),
      });
    }
  }
  return out;
}

type SegmentoRfvKey =
  | "campeoes" | "leais" | "potenciais" | "atencao" | "em_risco" | "perdidos" | "sem_dados";

function segmentoFromSoma(
  r: number | null | undefined,
  f: number | null | undefined,
  v: number | null | undefined,
): SegmentoRfvKey {
  if (r == null || f == null || v == null) return "sem_dados";
  const soma = r + f + v;
  if (soma >= 13) return "campeoes";
  if (soma >= 10) return "leais";
  if (soma >= 8) return "potenciais";
  if (soma >= 6) return "atencao";
  if (soma >= 4) return "em_risco";
  return "perdidos";
}

function passaFiltroRfv(
  seg: SegmentoRfvKey,
  modo: string | null | undefined,
  permitidos: string[] | null | undefined,
): boolean {
  if (modo !== "incluir") return true;
  const lista = permitidos || [];
  if (lista.length === 0) return true;
  return lista.includes(seg);
}

function tenantDeveRodarAgora(horario: string, agoraBRT: Date): boolean {
  const [hStr, mStr] = (horario || "").split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const alvoMin = h * 60 + m;
  const agoraMin = agoraBRT.getHours() * 60 + agoraBRT.getMinutes();
  const diff = Math.min(
    Math.abs(agoraMin - alvoMin),
    1440 - Math.abs(agoraMin - alvoMin),
  );
  return diff <= TOLERANCIA_MIN;
}

function getBRT(): Date {
  // Converte agora UTC para BRT (America/Sao_Paulo)
  const now = new Date();
  const brtStr = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  return new Date(brtStr);
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDaysISO(baseISO: string, days: number): string {
  const d = new Date(baseISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const agoraBRT = getBRT();
    const hojeISO = isoDate(agoraBRT);

    // 1. Buscar tenants ativos cujos horários estão dentro da janela
    const { data: configs, error: cfgErr } = await supabase
      .from("giftback_comunicacao_config")
      .select("tenant_id, horario_envio, ativo")
      .eq("ativo", true);

    if (cfgErr) throw cfgErr;

    const elegiveis = (configs || []).filter((c) =>
      tenantDeveRodarAgora(String(c.horario_envio || ""), agoraBRT),
    );

    console.log(
      `[gb-com] BRT=${agoraBRT.toISOString()} elegíveis=${elegiveis.length}/${configs?.length || 0}`,
    );

    let totalEnviados = 0;
    let totalFalhas = 0;
    let totalPulados = 0;
    const tenantsProcessados: string[] = [];

    for (const cfg of elegiveis) {
      const tenant_id = cfg.tenant_id as string;

      // 2. Já rodou hoje? (qualquer log do tenant em hojeISO indica execução prévia)
      const inicioDia = `${hojeISO}T00:00:00.000Z`;
      const { data: jaRodou } = await supabase
        .from("giftback_comunicacao_log")
        .select("id")
        .eq("tenant_id", tenant_id)
        .gte("enviado_em", inicioDia)
        .limit(1);

      if (jaRodou && jaRodou.length > 0) {
        console.log(`[gb-com] tenant=${tenant_id} já rodou hoje, pulando`);
        totalPulados++;
        continue;
      }

      // 3. Carregar config do WhatsApp Cloud do tenant
      const { data: cloud } = await supabase
        .from("whatsapp_cloud_config")
        .select("phone_number_id, access_token, status")
        .eq("tenant_id", tenant_id)
        .single();

      if (!cloud?.phone_number_id || !cloud?.access_token) {
        console.warn(`[gb-com] tenant=${tenant_id} sem WhatsApp Cloud configurado`);
        continue;
      }

      // 4. Carregar dados do tenant (nome para variável)
      const { data: tenantRow } = await supabase
        .from("tenants")
        .select("nome")
        .eq("id", tenant_id)
        .single();

      // 5. Carregar regras ativas
      const { data: regras } = await supabase
        .from("giftback_comunicacao_regras")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("ativo", true);

      if (!regras || regras.length === 0) {
        console.log(`[gb-com] tenant=${tenant_id} sem regras ativas`);
        continue;
      }

      tenantsProcessados.push(tenant_id);

      for (const regra of regras) {
        // 6. Buscar movimentos elegíveis por gatilho
        let query = supabase
          .from("giftback_movimentos")
          .select("id, contato_id, valor, validade, status, created_at, tipo")
          .eq("tenant_id", tenant_id)
          .eq("tipo", "credito");

        if (regra.tipo_gatilho === "criado") {
          // Criados hoje
          query = query
            .eq("status", "ativo")
            .gte("created_at", inicioDia)
            .lt("created_at", `${addDaysISO(hojeISO, 1)}T00:00:00.000Z`);
        } else if (regra.tipo_gatilho === "vencendo") {
          const alvo = addDaysISO(hojeISO, regra.dias_offset || 0);
          query = query.eq("status", "ativo").eq("validade", alvo);
        } else if (regra.tipo_gatilho === "expirado") {
          const alvo = addDaysISO(hojeISO, -(regra.dias_offset || 0));
          query = query.eq("status", "expirado").eq("validade", alvo);
        } else {
          continue;
        }

        const { data: movs, error: movErr } = await query;
        if (movErr) {
          console.error(`[gb-com] erro busca movs regra=${regra.id}:`, movErr);
          continue;
        }
        if (!movs || movs.length === 0) {
          console.log(`[gb-com] regra=${regra.nome} sem movimentos elegíveis`);
          continue;
        }

        // 7. Buscar contatos em batch (inclui RFV para filtro)
        const contatoIds = Array.from(new Set(movs.map((m) => m.contato_id)));
        const { data: contatos } = await supabase
          .from("contatos")
          .select("id, nome, telefone, saldo_giftback, rfv_recencia, rfv_frequencia, rfv_valor")
          .in("id", contatoIds);
        const contatosMap = new Map((contatos || []).map((c) => [c.id, c]));

        const filtroRfvModo = (regra as any).filtro_rfv_modo as string | undefined;
        const filtroRfvSegs = ((regra as any).filtro_rfv_segmentos as string[] | undefined) || [];

        for (const mov of movs) {
          // 8. Já enviou esta regra para este movimento?
          const { data: jaEnviado } = await supabase
            .from("giftback_comunicacao_log")
            .select("id")
            .eq("regra_id", regra.id)
            .eq("movimento_id", mov.id)
            .limit(1);

          if (jaEnviado && jaEnviado.length > 0) continue;

          const contato = contatosMap.get(mov.contato_id);
          if (!contato) continue;

          if (!contato.telefone) {
            await supabase.from("giftback_comunicacao_log").insert({
              tenant_id,
              regra_id: regra.id,
              movimento_id: mov.id,
              contato_id: mov.contato_id,
              status: "sem_telefone",
              erro: "Contato sem telefone cadastrado",
            });
            continue;
          }

          // 9. Resolver variáveis e montar payload
          const vars = buildVarsMap({
            contato,
            tenant: tenantRow,
            movimento: mov,
            hojeISO,
          });

          const components = montarComponents(
            (regra.template_components as any[]) || [],
            (regra.template_variaveis as Record<string, string>) || {},
            vars,
          );

          const phone = String(contato.telefone).replace(/\D/g, "");
          const payload = {
            messaging_product: "whatsapp",
            to: phone,
            type: "template",
            template: {
              name: regra.template_name,
              language: { code: regra.template_language },
              components,
            },
          };

          const url = `https://graph.facebook.com/${GRAPH_VERSION}/${cloud.phone_number_id}/messages`;

          try {
            const res = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${cloud.access_token}`,
              },
              body: JSON.stringify(payload),
            });
            const json = await res.json();

            if (!res.ok) {
              const errMsg = json?.error?.message || `HTTP ${res.status}`;
              await supabase.from("giftback_comunicacao_log").insert({
                tenant_id,
                regra_id: regra.id,
                movimento_id: mov.id,
                contato_id: mov.contato_id,
                status: "falha",
                erro: errMsg.slice(0, 500),
              });
              totalFalhas++;
              console.error(`[gb-com] envio falhou: ${errMsg}`);
            } else {
              const waId = json?.messages?.[0]?.id || null;
              await supabase.from("giftback_comunicacao_log").insert({
                tenant_id,
                regra_id: regra.id,
                movimento_id: mov.id,
                contato_id: mov.contato_id,
                status: "enviado",
                wa_message_id: waId,
              });
              totalEnviados++;
            }
          } catch (sendErr) {
            const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
            await supabase.from("giftback_comunicacao_log").insert({
              tenant_id,
              regra_id: regra.id,
              movimento_id: mov.id,
              contato_id: mov.contato_id,
              status: "falha",
              erro: msg.slice(0, 500),
            });
            totalFalhas++;
          }

          // delay aleatório entre envios
          await sleep(DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
        }
      }
    }

    const result = {
      ok: true,
      executado_em_brt: agoraBRT.toISOString(),
      tenants_elegiveis: elegiveis.length,
      tenants_processados: tenantsProcessados.length,
      tenants_pulados_ja_rodou: totalPulados,
      enviados: totalEnviados,
      falhas: totalFalhas,
    };
    console.log("[gb-com]", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gb-com] ERRO:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
