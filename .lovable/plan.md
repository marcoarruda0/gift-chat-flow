
# Relatórios do Giftback — `/relatorios/giftback`

Nova página de gestão com 9 métricas, filtros de período/atendente e gráficos. Inclui campo `genero` em contatos para a métrica de "Compras por gênero".

---

## 1. Banco de dados (1 migração)

### Coluna nova em `contatos`
- `genero text` (nullable) com CHECK em `('masculino','feminino','outro','nao_informado')`.
- Sem default — clientes antigos ficam `NULL` (exibidos como "Não informado" no relatório).

### Não criar enum
Texto simples + CHECK constraint é mais flexível para evolução futura. Imutável (sem `now()`), respeita as regras de migration.

---

## 2. Cadastro de gênero — `Contatos.tsx` + `CamposDinamicos.tsx`
- Adicionar Select de gênero no formulário de criação/edição de contato (logo após data de nascimento), com opções: Masculino, Feminino, Outro, Prefiro não informar.
- Persistir no campo nativo `genero` (não em `campos_personalizados`).

---

## 3. Página `/relatorios/giftback`

### Roteamento
- Adicionar rota em `src/App.tsx`: `/relatorios/giftback` → `RelatorioGiftback` (protegida, somente `admin_tenant` ou `admin_master`).
- Atualizar `AppSidebar.tsx` — submenu "Relatórios" passa a ter dois itens: "Atendimento" e "Giftback".

### Filtros (topo da página)
- **Período**: Select 7 / 30 / 90 / 365 dias + opção "Personalizado" (date range).
- **Atendente** (admin): "Todos" + lista de operadores via `profiles` do tenant.

### Layout
1. **Linha 1 — Cards de métricas (grid 3 colunas em desktop, 1 em mobile)**:
   - Receita total
   - Receita influenciada pela CRM Connect
   - Receita Gerada com Giftback
   - Número de vendas
   - Ticket médio
   - Percentual de retorno
   - Frequência média por cliente
2. **Linha 2 — Gráficos (Recharts)**:
   - **Faturamento por mês** — BarChart vertical, últimos 12 meses (independe do filtro de período, mostra evolução).
   - **Compras por gênero** — PieChart com 4 segmentos.

---

## 4. Definição das 9 métricas (todas escopadas por `tenant_id` + período + atendente opcional)

| Métrica | Cálculo |
|---|---|
| **Receita total** | `SUM(compras.valor)` no período |
| **Receita influenciada CRM Connect** | `SUM(compras.valor)` onde o `contato_id` recebeu nos últimos 30 dias antes da compra: (a) destinatário de campanha enviada (`campanha_destinatarios.status='enviado'`) OU (b) comunicação Giftback enviada (`giftback_comunicacao_log.status='enviado'`, `is_teste=false`) OU (c) execução de fluxo (`fluxo_sessoes` ativa para o contato). Deduplicado por `compra_id`. |
| **Receita Gerada com Giftback** | `SUM(compras.valor)` onde `compras.giftback_usado > 0` OR `compras.giftback_gerado > 0` |
| **Número de vendas** | `COUNT(compras)` no período |
| **Ticket médio** | Receita total / Número de vendas (0 se sem vendas) |
| **Percentual de retorno** | `(SUM(giftback_usado) / SUM(valor)) * 100` no período |
| **Frequência média por cliente** | `COUNT(compras) / COUNT(DISTINCT contato_id)` no período |
| **Faturamento por mês** | `date_trunc('month', created_at)` últimos 12 meses, soma de `valor` |
| **Compras por gênero** | `COUNT(compras)` agrupado por `contatos.genero` (NULL → "Não informado") |

### Função RPC SQL (server-side, performance)
Criar função `relatorio_giftback(p_inicio timestamptz, p_fim timestamptz, p_atendente_id uuid)` que retorna JSON com todas as métricas pré-calculadas. Vantagens:
- Uma única query → muito mais rápido que 9 fetches separados.
- Mantém a lógica de "receita influenciada" no Postgres (mais simples com EXISTS de 3 fontes).
- Tenant_id derivado de `get_user_tenant_id(auth.uid())` dentro da função (SECURITY DEFINER, search_path setado).
- Validação: se `p_atendente_id` informado, filtra `compras.operador_id`.

Estrutura do retorno:
```json
{
  "receita_total": 12345.67,
  "receita_influenciada": 8900.00,
  "receita_giftback": 2300.00,
  "num_vendas": 89,
  "ticket_medio": 138.71,
  "percentual_retorno": 5.2,
  "frequencia_media": 1.8,
  "faturamento_mensal": [{"mes":"2026-01","valor":3400}, ...],
  "compras_por_genero": [{"genero":"feminino","total":45}, {"genero":"masculino","total":30}, {"genero":"nao_informado","total":14}]
}
```

---

## 5. Frontend

### `src/pages/RelatorioGiftback.tsx` (novo)
- Mesma estrutura visual de `RelatorioAtendimento.tsx` (reusar `MetricCard`).
- Hook `useQuery` chamando `supabase.rpc('relatorio_giftback', { p_inicio, p_fim, p_atendente_id })`.
- Formatar valores em BRL via `Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'})`.
- Skeletons enquanto carrega; mensagem "Sem dados no período" quando vazio.

### `src/lib/giftback-relatorio.ts` (novo, lib pura)
- `formatBRL(n: number): string`
- `calcularTicketMedio(receita, vendas)`: pure (testável)
- `calcularPercentualRetorno(usado, total)`: pure
- `calcularFrequenciaMedia(vendas, clientesUnicos)`: pure
- Constantes `GENERO_LABELS`, `GENERO_COLORS` (paleta consistente com tokens).

### `src/lib/__tests__/giftback-relatorio.test.ts` (novo)
- Casos: divisão por zero, vendas zero, todos os clientes únicos, % retorno > 100% bloqueado, etc.

---

## 6. Exportação (bonus)
- Botão "Exportar PDF" no header da página, reusando padrão de `giftback-comunicacao-export.ts` (jspdf + autotable já instalado).
- PDF inclui: nome do tenant, período, todos os 7 cards + tabelas de faturamento mensal e compras por gênero.

---

## Resumo de arquivos

**Migração (1 nova)**:
- Adiciona `contatos.genero` text com CHECK constraint
- Cria função `public.relatorio_giftback(...)` SECURITY DEFINER

**Frontend (1 nova página + 1 lib + 1 teste + 3 modificados)**:
- `src/pages/RelatorioGiftback.tsx` (novo)
- `src/lib/giftback-relatorio.ts` (novo)
- `src/lib/__tests__/giftback-relatorio.test.ts` (novo)
- `src/App.tsx` — registrar rota
- `src/components/AppSidebar.tsx` — adicionar submenu Relatórios → Giftback
- `src/pages/Contatos.tsx` (e formulário relacionado) — campo gênero

**Sem novas dependências** (Recharts e jspdf já no projeto).
