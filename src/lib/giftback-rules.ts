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

/**
 * Ação que será aplicada sobre o ÚNICO giftback ativo do cliente
 * (se existir) ao registrar uma nova compra.
 *
 * - "nenhum"             → cliente não tinha ativo; não há nada a fazer.
 * - "usar"               → cliente optou por aplicar; ativo vira `usado`.
 * - "substituir"         → cliente NÃO usou e a compra gera novo crédito;
 *                          ativo antigo vira `inativo` (motivo: substituido).
 * - "invalidar_nao_uso"  → cliente NÃO usou e a compra NÃO gera novo;
 *                          ativo antigo vira `inativo` (motivo: nao_utilizado).
 */
export type AcaoSobreAtivo =
  | "nenhum"
  | "usar"
  | "substituir"
  | "invalidar_nao_uso";

export interface ResultadoTransacao {
  gbUsado: number; // 0 ou valor INTEGRAL do ativo (tudo-ou-nada)
  gbGerado: number; // valor do novo crédito (0 se compra < mínimo)
  acaoSobreAtivo: AcaoSobreAtivo;
  novoSaldo: number; // sempre = gbGerado (já que vira o único ativo)
  compraMinimaParaGerar: number;
  /**
   * Verdadeiro quando o giftback ativo foi criado HOJE (mesma data civil
   * local). Nesse caso a regra D+1 proíbe o resgate; o ativo NÃO é
   * invalidado por nova compra — segue válido para o dia seguinte.
   */
  bloqueadoMesmoDia: boolean;
  /**
   * Se preenchido, a operação NÃO pode ser executada — a UI deve
   * bloquear a confirmação e exibir esta mensagem ao operador.
   * Ex.: tentativa de resgate parcial (compra < valor do giftback ativo).
   */
  erroValidacao: string | null;
}

export interface CalcularTransacaoInput {
  saldoAtivo: number; // valor do ÚNICO giftback ativo (0 se não houver)
  valorCompra: number;
  aplicarGiftback: boolean;
  multiplicador: number;
  percentual: number;
  /**
   * Data/hora de criação do giftback ativo. Quando informado e for o
   * mesmo dia civil local que `agora`, a regra D+1 bloqueia o resgate.
   */
  criadoEm?: string | Date | null;
  /** Injeção de "agora" para testes. Default: `new Date()`. */
  agora?: Date;
}

/** Compara duas datas pela data civil local (YYYY-MM-DD). */
function isMesmoDiaLocal(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Calcula o resultado da transação seguindo a regra
 * "1 giftback ativo por cliente" + resgate tudo-ou-nada.
 *
 * Função pura (sem side-effects), usada tanto pela UI do caixa
 * quanto pelos testes.
 */
export function calcularTransacaoGiftback(
  input: CalcularTransacaoInput,
): ResultadoTransacao {
  const saldoAtivo = Math.max(0, Number(input.saldoAtivo) || 0);
  const valorCompra = Math.max(0, Number(input.valorCompra) || 0);
  const multiplicador = Math.max(0, Number(input.multiplicador) || 0);
  const percentual = Math.max(0, Number(input.percentual) || 0);
  const aplicar = !!input.aplicarGiftback && saldoAtivo > 0;

  // Regra D+1: giftback criado HOJE não pode ser resgatado no mesmo dia.
  const agora = input.agora ?? new Date();
  let bloqueadoMesmoDia = false;
  if (saldoAtivo > 0 && input.criadoEm) {
    const criado =
      input.criadoEm instanceof Date
        ? input.criadoEm
        : new Date(input.criadoEm);
    if (!Number.isNaN(criado.getTime()) && isMesmoDiaLocal(criado, agora)) {
      bloqueadoMesmoDia = true;
    }
  }

  const compraMinimaParaGerar = saldoAtivo * multiplicador;
  const gerouNovo = valorCompra > 0 && valorCompra >= compraMinimaParaGerar;
  const gbGerado = gerouNovo ? valorCompra * (percentual / 100) : 0;

  // Bloqueio D+1: se operador tentou aplicar, devolve erro claro.
  if (bloqueadoMesmoDia && input.aplicarGiftback) {
    return {
      gbUsado: 0,
      gbGerado: 0,
      acaoSobreAtivo: "nenhum",
      novoSaldo: saldoAtivo,
      compraMinimaParaGerar,
      bloqueadoMesmoDia: true,
      erroValidacao:
        "Giftback criado hoje só pode ser utilizado a partir de amanhã (D+1).",
    };
  }

  // Resgate tudo-ou-nada: a compra precisa cobrir o valor INTEGRAL do ativo.
  if (aplicar && valorCompra < saldoAtivo) {
    return {
      gbUsado: 0,
      gbGerado: 0,
      acaoSobreAtivo: "nenhum",
      novoSaldo: saldoAtivo,
      compraMinimaParaGerar,
      bloqueadoMesmoDia,
      erroValidacao: `Resgate é tudo-ou-nada: a compra precisa ser ≥ R$ ${saldoAtivo.toFixed(
        2,
      )} para utilizar o giftback ativo integralmente.`,
    };
  }

  let acao: AcaoSobreAtivo = "nenhum";
  let gbUsado = 0;

  if (saldoAtivo > 0) {
    if (aplicar) {
      gbUsado = saldoAtivo;
      acao = "usar";
    } else if (bloqueadoMesmoDia) {
      // Cliente fez nova compra mas o ativo é do mesmo dia → preserva
      // o ativo (não invalida nem substitui). Nova compra não gera
      // crédito adicional, pois só pode existir 1 giftback ativo.
      acao = "nenhum";
    } else if (gerouNovo) {
      acao = "substituir";
    } else {
      // Cliente fez nova compra e não usou o ativo → perde.
      acao = "invalidar_nao_uso";
    }
  }

  // Quando o ativo é preservado pela regra D+1, o novo saldo continua
  // sendo o valor do ativo (e não há geração de novo crédito).
  const novoSaldo =
    saldoAtivo > 0 && bloqueadoMesmoDia && !aplicar ? saldoAtivo : gbGerado;

  return {
    gbUsado,
    gbGerado: saldoAtivo > 0 && bloqueadoMesmoDia && !aplicar ? 0 : gbGerado,
    acaoSobreAtivo: acao,
    novoSaldo,
    compraMinimaParaGerar,
    bloqueadoMesmoDia,
    erroValidacao: null,
  };
}

/**
 * Faz parse defensivo do valor digitado pelo operador no caixa.
 * Aceita string com vírgula ou ponto. Retorna `{ valor: 0, erro: null }`
 * para entrada vazia (estado inicial) e mensagens claras para qualquer
 * coisa inválida (NaN, negativo, zero, acima do limite).
 */
export function parseValorCompra(
  raw: string | null | undefined,
): { valor: number; erro: string | null } {
  const limpo = (raw ?? "").toString().trim().replace(",", ".");
  if (!limpo) return { valor: 0, erro: null };
  const n = Number(limpo);
  if (!Number.isFinite(n)) {
    return { valor: 0, erro: "Valor inválido (não é um número)." };
  }
  if (n < 0) {
    return { valor: 0, erro: "Valor da compra não pode ser negativo." };
  }
  if (n === 0) {
    return { valor: 0, erro: "Valor da compra deve ser maior que zero." };
  }
  if (n > 1_000_000) {
    return {
      valor: 0,
      erro: "Valor acima do limite permitido (R$ 1.000.000,00).",
    };
  }
  // Limita a 2 casas decimais (centavos)
  const arredondado = Math.round(n * 100) / 100;
  return { valor: arredondado, erro: null };
}
