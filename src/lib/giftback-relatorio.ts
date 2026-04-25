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
  error?: string;
}
