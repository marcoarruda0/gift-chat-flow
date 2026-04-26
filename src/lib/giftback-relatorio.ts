/**
 * Helpers puros para o Relatório do Giftback.
 * Sem dependências externas — facilmente testáveis.
 */

export const GENERO_LABELS: Record<string, string> = {
  masculino: "Masculino",
  feminino: "Feminino",
  outro: "Outro",
  nao_informado: "Não informado",
};

// HSL strings compatíveis com tokens do design system
export const GENERO_COLORS: Record<string, string> = {
  masculino: "hsl(217 91% 60%)",
  feminino: "hsl(330 81% 60%)",
  outro: "hsl(262 83% 58%)",
  nao_informado: "hsl(220 9% 46%)",
};

export const GENERO_OPCOES = [
  { value: "masculino", label: "Masculino" },
  { value: "feminino", label: "Feminino" },
  { value: "outro", label: "Outro" },
  { value: "nao_informado", label: "Prefiro não informar" },
] as const;

export function formatBRL(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

export function formatNumber(n: number | null | undefined, casas = 2): string {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(v);
}

export function calcularTicketMedio(receita: number, vendas: number): number {
  if (!vendas || vendas <= 0) return 0;
  return receita / vendas;
}

export function calcularPercentualRetorno(
  giftbackUsado: number,
  receitaTotal: number,
): number {
  if (!receitaTotal || receitaTotal <= 0) return 0;
  const pct = (giftbackUsado / receitaTotal) * 100;
  if (!Number.isFinite(pct) || pct < 0) return 0;
  return pct;
}

export function calcularFrequenciaMedia(
  vendas: number,
  clientesUnicos: number,
): number {
  if (!clientesUnicos || clientesUnicos <= 0) return 0;
  return vendas / clientesUnicos;
}

/** Converte 'YYYY-MM' para label curta tipo 'jan/26'. */
export function formatMesLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map((p) => parseInt(p, 10));
  if (!y || !m) return yyyymm;
  const meses = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  const mm = meses[m - 1] || "";
  return `${mm}/${String(y).slice(-2)}`;
}

export interface ComparativoPeriodo {
  receita_total_anterior: number;
  receita_influenciada_anterior: number;
  receita_giftback_anterior: number;
  inicio_anterior?: string;
  fim_anterior?: string;
}

export interface TopAtendente {
  id: string;
  nome: string;
  receita: number;
  num_vendas: number;
}

export interface TicketPorGenero {
  genero: string;
  ticket_medio: number;
  num_vendas: number;
}

export interface RankingMes {
  mes: string;
  valor: number;
}

export interface RelatorioGiftbackData {
  receita_total: number;
  receita_influenciada: number;
  receita_giftback: number;
  num_vendas: number;
  clientes_unicos: number;
  ticket_medio: number;
  percentual_retorno: number;
  frequencia_media: number;
  faturamento_mensal: { mes: string; valor: number }[];
  compras_por_genero: { genero: string; total: number }[];
  comparativo?: ComparativoPeriodo;
  top_atendente?: TopAtendente | null;
  ticket_por_genero?: TicketPorGenero[];
  ranking_meses_periodo?: RankingMes[];
  error?: string;
}

export type DirecaoVariacao = "up" | "down" | "flat" | "novo";

export interface VariacaoPct {
  pct: number;
  direcao: DirecaoVariacao;
}

/**
 * Calcula variação percentual entre dois valores.
 * - anterior 0 e atual > 0 → 'novo' (sem base de comparação)
 * - ambos 0 → 'flat'
 */
export function calcularVariacaoPct(
  atual: number,
  anterior: number,
): VariacaoPct {
  const a = Number(atual) || 0;
  const b = Number(anterior) || 0;
  if (b === 0 && a === 0) return { pct: 0, direcao: "flat" };
  if (b === 0 && a > 0) return { pct: 100, direcao: "novo" };
  if (b === 0 && a < 0) return { pct: -100, direcao: "down" };
  const pct = ((a - b) / Math.abs(b)) * 100;
  if (!Number.isFinite(pct)) return { pct: 0, direcao: "flat" };
  if (Math.abs(pct) < 0.01) return { pct: 0, direcao: "flat" };
  return { pct, direcao: pct > 0 ? "up" : "down" };
}

export function formatVariacaoPct(v: VariacaoPct | null | undefined): string {
  if (!v) return "—";
  if (v.direcao === "flat") return "0,00%";
  if (v.direcao === "novo") return "novo";
  const sinal = v.pct > 0 ? "+" : "";
  return `${sinal}${formatNumber(v.pct, 2)}%`;
}

export interface ValidacaoPeriodo {
  ok: boolean;
  erro?: string;
}

/**
 * Valida o filtro de período personalizado.
 * Exige ambas as datas em formato YYYY-MM-DD e fim >= inicio.
 */
export function validarPeriodoCustom(
  inicio: string,
  fim: string,
): ValidacaoPeriodo {
  if (!inicio && !fim) {
    return { ok: false, erro: "Informe a data de início e a data fim." };
  }
  if (!inicio) return { ok: false, erro: "Informe a data de início." };
  if (!fim) return { ok: false, erro: "Informe a data fim." };

  const di = new Date(inicio);
  const df = new Date(fim);
  if (Number.isNaN(di.getTime())) {
    return { ok: false, erro: "Data de início inválida." };
  }
  if (Number.isNaN(df.getTime())) {
    return { ok: false, erro: "Data fim inválida." };
  }
  if (df < di) {
    return { ok: false, erro: "A Data fim deve ser maior ou igual à Data de início." };
  }
  return { ok: true };
}
