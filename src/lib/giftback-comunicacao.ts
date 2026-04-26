// Lógica pura para comunicações de Giftback (testável, sem dependências de Supabase).
// Compartilhada entre frontend (preview) e edge function (envio real).

export type GbGatilho = "criado" | "vencendo" | "expirado";

export interface GbVarContexto {
  contato: { nome?: string | null; saldo_giftback?: number | null };
  tenant: { nome?: string | null };
  movimento: { id: string; valor: number; validade?: string | null };
  hojeISO?: string; // YYYY-MM-DD
}

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
  const ms = alvo.getTime() - hoje.getTime();
  return Math.round(ms / 86_400_000).toString();
};

export function buildVarsMap(ctx: GbVarContexto): Record<string, string> {
  return {
    nome_cliente: ctx.contato.nome || "",
    nome_empresa: ctx.tenant.nome || "",
    valor_giftback: fmtBRL(ctx.movimento.valor),
    saldo_giftback: fmtBRL(ctx.contato.saldo_giftback ?? 0),
    id_giftback: ctx.movimento.id.slice(0, 8).toUpperCase(),
    data_vencimento: fmtData(ctx.movimento.validade),
    dias_ate_expirar: diffDias(ctx.movimento.validade, ctx.hojeISO),
  };
}

/**
 * Resolve placeholders {{var}} dentro de uma string.
 * Variáveis ausentes viram string vazia (não quebra o template).
 */
export function resolverVariaveis(
  texto: string,
  vars: Record<string, string>,
): string {
  if (!texto) return "";
  return texto.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    return vars[key] ?? "";
  });
}

/** Extrai placeholders {{n}} numéricos (formato Meta) de um texto de template. */
export function extractMetaPlaceholders(text: string): number[] {
  const matches = (text || "").matchAll(/\{\{(\d+)\}\}/g);
  const nums = new Set<number>();
  for (const m of matches) nums.add(parseInt(m[1], 10));
  return Array.from(nums).sort((a, b) => a - b);
}

/**
 * Monta os components no formato Graph API substituindo {{var}} pelos valores reais.
 * @param templateComponents Snapshot dos components do template Meta.
 * @param mappingVariaveis Mapping `{ "body.1": "Olá {{nome_cliente}}" }`.
 */
export function montarComponentsTemplate(
  templateComponents: any[],
  mappingVariaveis: Record<string, string>,
  vars: Record<string, string>,
): any[] {
  const out: any[] = [];
  for (const comp of templateComponents || []) {
    const type = String(comp?.type || "").toUpperCase();

    if (type === "HEADER") {
      const format = String(comp.format || "TEXT").toUpperCase();

      if (format === "TEXT") {
        const placeholders = extractMetaPlaceholders(comp.text || "");
        if (placeholders.length === 0) continue;
        out.push({
          type: "header",
          parameters: placeholders.map((n) => ({
            type: "text",
            text: resolverVariaveis(mappingVariaveis[`header.${n}`] || "", vars),
          })),
        });
      } else if (format === "IMAGE" && comp.media_url) {
        out.push({
          type: "header",
          parameters: [{ type: "image", image: { link: comp.media_url } }],
        });
      } else if (format === "VIDEO" && comp.media_url) {
        out.push({
          type: "header",
          parameters: [{ type: "video", video: { link: comp.media_url } }],
        });
      }
      // Outros formatos (DOCUMENT, LOCATION) ou IMAGE/VIDEO sem media_url: pulamos.
    } else if (type === "BODY") {
      const placeholders = extractMetaPlaceholders(comp.text || "");
      if (placeholders.length === 0) continue;
      out.push({
        type: "body",
        parameters: placeholders.map((n) => ({
          type: "text",
          text: resolverVariaveis(mappingVariaveis[`body.${n}`] || "", vars),
        })),
      });
    }
  }
  return out;
}

/** Texto-preview do BODY já com variáveis resolvidas. */
export function buildPreviewText(
  templateComponents: any[],
  mappingVariaveis: Record<string, string>,
  vars: Record<string, string>,
): string {
  const body = (templateComponents || []).find(
    (c: any) => String(c?.type || "").toUpperCase() === "BODY",
  );
  if (!body?.text) return "";
  let txt = body.text as string;
  for (const n of extractMetaPlaceholders(txt)) {
    const raw = mappingVariaveis[`body.${n}`] || "";
    txt = txt.split(`{{${n}}}`).join(resolverVariaveis(raw, vars));
  }
  return txt;
}

/**
 * Decide se um tenant deve rodar agora.
 * Janela de tolerância (em minutos) para drift do cron.
 *
 * @param horarioConfig string "HH:MM" no fuso BRT
 * @param agoraBRT objeto Date com hora atual em BRT (caller converte)
 * @param toleranciaMin janela de minutos de tolerância (ex.: 7 = ±7min)
 */
export function tenantDeveRodarAgora(
  horarioConfig: string,
  agoraBRT: { hours: number; minutes: number },
  toleranciaMin: number,
): boolean {
  const [hStr, mStr] = (horarioConfig || "").split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;

  const alvoMin = h * 60 + m;
  const agoraMin = agoraBRT.hours * 60 + agoraBRT.minutes;
  // Considera ciclo de 24h (1440min)
  const diff = Math.min(
    Math.abs(agoraMin - alvoMin),
    1440 - Math.abs(agoraMin - alvoMin),
  );
  return diff <= toleranciaMin;
}

/**
 * Deriva o segmento RFV a partir das três notas (recência, frequência, valor).
 * Mantida em sincronia com src/lib/rfv-segments.ts → getSegmentoBySoma.
 * Retorna a chave do segmento (string) para uso em filtros.
 */
export type SegmentoRfvKey =
  | "campeoes"
  | "leais"
  | "potenciais"
  | "atencao"
  | "em_risco"
  | "perdidos"
  | "sem_dados";

export function segmentoFromSoma(
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

/**
 * Verifica se um contato passa pelo filtro de segmento RFM da regra.
 * @param modo "todos" = passa sempre; "incluir" = só passa se segmento estiver na lista
 */
export function contatoPassaFiltroRfv(
  segmentoContato: SegmentoRfvKey,
  modo: string | null | undefined,
  segmentosPermitidos: string[] | null | undefined,
): boolean {
  if (modo !== "incluir") return true;
  const lista = segmentosPermitidos || [];
  if (lista.length === 0) return true;
  return lista.includes(segmentoContato);
}

export const VARIAVEIS_DISPONIVEIS: Array<{ key: string; label: string; exemplo: string }> = [
  { key: "nome_cliente", label: "Nome do cliente", exemplo: "Maria Silva" },
  { key: "nome_empresa", label: "Nome da empresa/loja", exemplo: "Loja Exemplo" },
  { key: "valor_giftback", label: "Valor do giftback", exemplo: "R$ 50,00" },
  { key: "saldo_giftback", label: "Saldo total atual", exemplo: "R$ 50,00" },
  { key: "id_giftback", label: "ID do giftback (8 chars)", exemplo: "A1B2C3D4" },
  { key: "data_vencimento", label: "Data de vencimento", exemplo: "25/05/2026" },
  { key: "dias_ate_expirar", label: "Dias até expirar", exemplo: "7" },
];
