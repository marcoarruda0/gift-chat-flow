

# Plano: Relatório de Tempo de Atendimento + Fix Gráfico Dashboard

## Parte 1 — Corrigir gráfico "Mensagens por Dia" no Dashboard

**Problema atual** (`src/pages/Index.tsx`): O gráfico usa `mockChartData` com valores aleatórios (`Math.random()`). Não consulta o banco.

**Correção**:
- Adicionar `useQuery` que busca da tabela `mensagens` os últimos 30 dias filtrando por `tenant_id`
- Agrupar no client por dia (`created_at` → `YYYY-MM-DD`)
- Gerar série completa de 30 dias (preenchendo dias sem mensagens com 0)
- Substituir `mockChartData` pelos dados reais
- Também tornar reais os outros cards: "Conversas Ativas" (count de `conversas` status=aberta), "Mensagens (mês)" (count mensagens do mês corrente), "Giftback Emitido" (sum de `giftback_movimentos` tipo=credito)

## Parte 2 — Novo painel "Relatório de Atendimento"

**Nova página**: `src/pages/RelatorioAtendimento.tsx`

**Métricas (cards no topo)**:
- Tempo médio de atendimento (média de `atendimento_encerrado_at - atendimento_iniciado_at`)
- Tempo médio de espera (média de `atendimento_iniciado_at - created_at`)
- Total de atendimentos finalizados no período
- Atendimentos em andamento (iniciado mas não encerrado)

**Filtros**:
- Período (últimos 7d, 30d, 90d, customizado)
- Atendente (select com membros do tenant)

**Tabela detalhada**:
- Colunas: Contato, Atendente, Iniciado em, Encerrado em, Duração, Tempo de espera
- Ordenada por encerramento desc

**Gráfico**:
- Barras: tempo médio de atendimento por atendente (top 10)

**Acesso**: Apenas admins (`admin_tenant` ou `admin_master`).

## Parte 3 — Roteamento e navegação

- Adicionar rota `/relatorios/atendimento` em `src/App.tsx`
- Adicionar item no `AppSidebar.tsx` (visível só para admins) com ícone `BarChart3`, label "Relatórios" → "Atendimento"

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Index.tsx` | Substituir mock por queries reais (mensagens, conversas, giftback) |
| `src/pages/RelatorioAtendimento.tsx` | **Novo** — painel completo com métricas, filtros, tabela e gráfico |
| `src/App.tsx` | Nova rota `/relatorios/atendimento` |
| `src/components/AppSidebar.tsx` | Novo item de menu "Relatórios" (admin-only) |

## Resultado esperado

Dashboard mostra dados reais de mensagens dos últimos 30 dias. Admins têm acesso a um relatório dedicado mostrando tempo médio de atendimento, espera, e ranking por atendente — usando os campos `atendimento_iniciado_at` e `atendimento_encerrado_at` já existentes.

