import { getSegmentoBySoma, type SegmentoKey } from "./rfv-segments";

export interface GiftbackConfigGlobal {
  percentual: number | null;
  validade_dias: number | null;
  compra_minima: number | null;
  credito_maximo: number | null;
  max_resgate_pct: number | null;
}

export interface GiftbackConfigRfvOverride {
  segmento: SegmentoKey;
  ativo: boolean;
  percentual: number | null;
  validade_dias: number | null;
  compra_minima: number | null;
  credito_maximo: number | null;
  max_resgate_pct: number | null;
}

export interface RegrasGiftbackResolvidas {
  percentual: number;
  validade_dias: number;
  compra_minima: number;
  credito_maximo: number;
  max_resgate_pct: number;
  segmentoAplicado: SegmentoKey | null;
  origem: "override" | "global";
}

const DEFAULTS: Required<{
  [K in keyof Omit<GiftbackConfigGlobal, never>]: number;
}> = {
  percentual: 10,
  validade_dias: 30,
  compra_minima: 0,
  credito_maximo: 9999,
  max_resgate_pct: 100,
};

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
 * 4. Se não houver dados RFV ou override, retorna apenas o global.
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

  const pick = (campo: keyof GiftbackConfigGlobal): number => {
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
    compra_minima: pick("compra_minima"),
    credito_maximo: pick("credito_maximo"),
    max_resgate_pct: pick("max_resgate_pct"),
    segmentoAplicado: segmentoKey,
    origem: override ? "override" : "global",
  };
}
