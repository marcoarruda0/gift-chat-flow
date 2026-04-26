## Objetivo

Evoluir o relatório `/relatorios/giftback` com 3 melhorias:

1. **Comparação período atual × período anterior** (variação % de Receita total, Receita influenciada e Receita com Giftback)
2. **Validações** para o filtro de período personalizado (datas obrigatórias e Data fim ≥ Data início)
3. **Painel "Resumo executivo"** com Top atendente, Ticket médio por gênero e Ranking de meses por faturamento no período

---

## 1) Banco de dados — Estender RPC `relatorio_giftback`

Migração nova substituindo `relatorio_giftback` (mesma assinatura), agregando novos campos no JSON de retorno:

- **Período anterior**: calcular `p_anterior_inicio = p_inicio - (p_fim - p_inicio)` e `p_anterior_fim = p_inicio`. Retornar `comparativo`:
  ```json
  {
    "receita_total_anterior": number,
    "receita_influenciada_anterior": number,
    "receita_giftback_anterior": number
  }
  ```
- **Top atendente** (no período): `LEFT JOIN profiles` em `compras.operador_id`, agrupar por operador, somar `valor`, retornar top 1: `{ id, nome, receita, num_vendas }`. Se não houver, `null`.
- **Ticket médio por gênero** (no período): `AVG(valor)` agrupado por `COALESCE(contatos.genero, 'nao_informado')`. Retornar array `[{ genero, ticket_medio, num_vendas }]`.
- **Ranking de meses por faturamento no período** (apenas meses dentro de `[p_inicio, p_fim)`): top 3 ordenados por valor desc, formato `[{ mes: 'YYYY-MM', valor }]`. Reaproveita a CTE de faturamento mensal mas filtrada pelo período.

A função continua `SECURITY DEFINER`, escopada pelo `tenant_id` via `get_user_tenant_id(auth.uid())`. Mantemos campos antigos para retrocompatibilidade.

---

## 2) Helpers puros — `src/lib/giftback-relatorio.ts`

Adicionar:

- `calcularVariacaoPct(atual: number, anterior: number): { pct: number; direcao: 'up' | 'down' | 'flat' | 'novo' }`
  - `anterior === 0 && atual > 0` → `{ pct: 100, direcao: 'novo' }`
  - `anterior === 0 && atual === 0` → `{ pct: 0, direcao: 'flat' }`
  - caso geral: `((atual - anterior) / anterior) * 100`
- `formatVariacaoPct(v): string` → `+12,34%` / `-5,00%` / `—`
- `validarPeriodoCustom(inicio: string, fim: string): { ok: boolean; erro?: string }`
  - exige ambos preenchidos
  - data válida (parse ISO)
  - `fim >= inicio`
- Estender `RelatorioGiftbackData` com:
  ```ts
  comparativo?: {
    receita_total_anterior: number;
    receita_influenciada_anterior: number;
    receita_giftback_anterior: number;
  };
  top_atendente?: { id: string; nome: string; receita: number; num_vendas: number } | null;
  ticket_por_genero?: { genero: string; ticket_medio: number; num_vendas: number }[];
  ranking_meses_periodo?: { mes: string; valor: number }[];
  ```

Adicionar testes em `src/lib/__tests__/giftback-relatorio.test.ts` cobrindo:
- variação positiva, negativa, zero, novo (anterior=0)
- validação de período: vazio, fim<inicio, datas inválidas, caso ok

---

## 3) UI — `src/pages/RelatorioGiftback.tsx`

### 3a) Validação de período personalizado
- Calcular `validacao = validarPeriodoCustom(dataInicio, dataFim)` quando `periodo === 'custom'`.
- Quando inválido: exibir `<Alert variant="destructive">` abaixo dos filtros com a mensagem retornada e **desabilitar a query** (`enabled: ... && validacaoOk`).
- Mantém o `useMemo` atual mas só constrói `inicio/fim` quando válido.

### 3b) Cards de comparação (topo, acima do grid de métricas)
Novo bloco "Variação vs período anterior" com 3 cards compactos lado a lado:
- Receita total: valor atual + badge com variação % (verde ↑ / vermelho ↓ / cinza —) + valor do período anterior em texto pequeno.
- Receita influenciada: idem.
- Receita com Giftback: idem.

Componente local `<ComparativoCard>` reutilizando tokens do design system (`text-success`, `text-destructive`, `bg-muted`). Ícones `ArrowUp`, `ArrowDown`, `Minus` do lucide-react.

### 3c) Painel "Resumo executivo"
Card único com `CardHeader` "Resumo executivo" e `CardContent` em grid `md:grid-cols-3`:
- **Top atendente**: avatar inicial + nome + `formatBRL(receita)` + `num_vendas` vendas. Vazio: "Sem dados no período".
- **Ticket médio por gênero**: lista compacta com badge colorido (`GENERO_COLORS`) + label + `formatBRL(ticket_medio)`. Ordenada desc.
- **Ranking de meses (no período)**: top 3 com posição (1º, 2º, 3º) + `formatMesLabel(mes)` + `formatBRL(valor)`.

Posicionado **acima dos cards de métricas** e **abaixo dos cards de comparação**, conforme pedido ("acima dos cards").

Skeletons enquanto `isLoading`.

---

## 4) Tipos do Supabase

`src/integrations/supabase/types.ts` é regenerado automaticamente após a migration. Sem edição manual.

---

## Arquivos afetados

- **Nova migration**: `supabase/migrations/<timestamp>_relatorio_giftback_v2.sql` (substitui a função com `CREATE OR REPLACE`)
- **Modificado**: `src/lib/giftback-relatorio.ts` (helpers + tipos)
- **Modificado**: `src/lib/__tests__/giftback-relatorio.test.ts` (novos testes)
- **Modificado**: `src/pages/RelatorioGiftback.tsx` (validação, comparativos, resumo executivo)

Sem mudanças em RLS (a função roda como SECURITY DEFINER e já filtra por tenant).
