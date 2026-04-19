// Segmentação RFV baseada na SOMA (R+F+V), variando de 3 a 15.
// Quanto maior a soma, melhor o cliente.

export type SegmentoKey =
  | "campeoes"
  | "leais"
  | "potenciais"
  | "atencao"
  | "em_risco"
  | "perdidos"
  | "sem_dados";

export interface Segmento {
  key: SegmentoKey;
  nome: string;
  descricao: string;
  // Cores em HEX puro (usadas no gráfico Recharts e badges com style inline,
  // já que precisamos de cores categóricas distintas para os segmentos).
  cor: string;
  // Classes Tailwind para texto sobre a cor (usado em badges)
  textClass: string;
}

export const SEGMENTOS: Record<SegmentoKey, Segmento> = {
  campeoes: {
    key: "campeoes",
    nome: "Campeões",
    descricao: "Soma 13-15 — melhores clientes",
    cor: "#16a34a", // green-600
    textClass: "text-white",
  },
  leais: {
    key: "leais",
    nome: "Leais",
    descricao: "Soma 10-12 — compram com frequência",
    cor: "#2563eb", // blue-600
    textClass: "text-white",
  },
  potenciais: {
    key: "potenciais",
    nome: "Potenciais",
    descricao: "Soma 8-9 — bom potencial de fidelização",
    cor: "#06b6d4", // cyan-500
    textClass: "text-white",
  },
  atencao: {
    key: "atencao",
    nome: "Atenção",
    descricao: "Soma 6-7 — precisam de atenção",
    cor: "#eab308", // yellow-500
    textClass: "text-black",
  },
  em_risco: {
    key: "em_risco",
    nome: "Em Risco",
    descricao: "Soma 4-5 — risco de perder",
    cor: "#f97316", // orange-500
    textClass: "text-white",
  },
  perdidos: {
    key: "perdidos",
    nome: "Perdidos",
    descricao: "Soma 3 — clientes inativos",
    cor: "#dc2626", // red-600
    textClass: "text-white",
  },
  sem_dados: {
    key: "sem_dados",
    nome: "Sem dados",
    descricao: "RFV ainda não calculado",
    cor: "#94a3b8", // slate-400
    textClass: "text-white",
  },
};

export const SEGMENTOS_ORDENADOS: Segmento[] = [
  SEGMENTOS.campeoes,
  SEGMENTOS.leais,
  SEGMENTOS.potenciais,
  SEGMENTOS.atencao,
  SEGMENTOS.em_risco,
  SEGMENTOS.perdidos,
  SEGMENTOS.sem_dados,
];

export function getSegmentoBySoma(
  r: number | null | undefined,
  f: number | null | undefined,
  v: number | null | undefined,
): Segmento {
  if (r == null || f == null || v == null) return SEGMENTOS.sem_dados;
  const soma = r + f + v;
  if (soma >= 13) return SEGMENTOS.campeoes;
  if (soma >= 10) return SEGMENTOS.leais;
  if (soma >= 8) return SEGMENTOS.potenciais;
  if (soma >= 6) return SEGMENTOS.atencao;
  if (soma >= 4) return SEGMENTOS.em_risco;
  return SEGMENTOS.perdidos;
}
