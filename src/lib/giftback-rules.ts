import { getSegmentoBySoma, type SegmentoKey } from "./rfv-segments";

export interface GiftbackConfigGlobal {
  percentual: number | null;
  validade_dias: number | null;
  multiplicador_compra_minima: number | null;
}

export interface GiftbackConfigRfvOverride {
  segmento: SegmentoKey;
  ativo: boolean;
  percentual: number | null;
  validade_dias: number | null;
  multiplicador_compra_minima: number | null;
}

export interface RegrasGiftbackResolvidas {
  percentual: number;
  validade_dias: number;
  multiplicador_compra_minima: number;
  segmentoAplicado: SegmentoKey | null;
  origem: "override" | "global";
}

const DEFAULTS = {
  percentual: 10,
  validade_dias: 30,
  multiplicador_compra_minima: 4,
} as const;

interface ResolverParams {
  configGlobal: GiftbackConfigGlobal | null | undefined;
  overrides: GiftbackConfigRfvOverride[] | null | undefined;
  contato: {
    rfv_recencia?: number | null;
    rfv_frequencia?: number | null;
    rfv_valor?: number | null;
  };
}

/**
 * Resolve as regras de giftback aplicáveis a um contato:
 * 1. Identifica o segmento RFV do contato (se calculado).
 * 2. Procura override ATIVO para esse segmento.
 * 3. Faz merge campo a campo: override ?? global ?? default.
 */
export function resolverRegrasGiftback({
  configGlobal,
  overrides,
  contato,
}: ResolverParams): RegrasGiftbackResolvidas {
  const segmento = getSegmentoBySoma(
    contato.rfv_recencia,
    contato.rfv_frequencia,
    contato.rfv_valor,
  );
  const segmentoKey =
    segmento.key === "sem_dados" ? null : (segmento.key as SegmentoKey);

  const override =
    segmentoKey && overrides
      ? overrides.find((o) => o.segmento === segmentoKey && o.ativo)
      : undefined;

  const pick = (campo: keyof typeof DEFAULTS): number => {
    if (override) {
      const v = override[campo as keyof GiftbackConfigRfvOverride];
      if (v !== null && v !== undefined && typeof v === "number") return v;
    }
    const g = configGlobal?.[campo];
    if (g !== null && g !== undefined) return Number(g);
    return DEFAULTS[campo];
  };

  return {
    percentual: pick("percentual"),
    validade_dias: pick("validade_dias"),
    multiplicador_compra_minima: pick("multiplicador_compra_minima"),
    segmentoAplicado: segmentoKey,
    origem: override ? "override" : "global",
  };
}

/**
 * Calcula a compra mínima necessária para que o cliente gere novo giftback.
 * Regra: saldo atual × multiplicador. Se saldo = 0 ou multiplicador = 0,
 * a barreira desaparece (qualquer compra gera giftback).
 */
export function calcularCompraMinima(
  saldoGiftback: number | null | undefined,
  multiplicador: number | null | undefined,
): number {
  const s = Number(saldoGiftback) || 0;
  const m = Number(multiplicador) || 0;
  return s * m;
}
