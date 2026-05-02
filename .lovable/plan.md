## Objetivo

Adicionar, na página **Vendas Online**, uma nova seção (abaixo da tabela atual) que lista todos os produtos **vendidos/pagos** com gerenciamento de **alocação em locais físicos** e marcação de **entrega**.

## 1. Banco de dados (migrations)

### Nova tabela `vendas_online_locais`
Cadastro dos locais físicos onde os produtos vendidos ficam alocados aguardando retirada.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid | RLS por tenant |
| `nome` | text | Ex: "Prateleira A1", "Estoque Frente" |
| `descricao` | text nullable | |
| `ativo` | boolean default true | |
| `created_at` / `updated_at` | timestamptz | |

RLS: SELECT por tenant; INSERT/UPDATE/DELETE para qualquer membro do tenant (mesmo padrão de `chamado_denis_itens`).

### Colunas novas em `chamado_denis_itens`
- `local_id` uuid nullable → FK lógica para `vendas_online_locais.id`
- `entregue` boolean default false
- `entregue_em` timestamptz nullable
- `entregue_por` uuid nullable (auth user)
- `forma_pagamento` text nullable (preenchido pelo webhook a partir de `payment.method`, ex: PIX)

O webhook `vendas-online-webhook` passará a gravar `forma_pagamento` quando processar `billing.paid`.

## 2. Edge function: ajuste no webhook

Em `vendas-online-webhook/index.ts`, no bloco `billing.paid`, incluir no UPDATE do item:
```ts
forma_pagamento: data?.payment?.method ?? null,
```

## 3. UI — `src/pages/ChamadoDenis.tsx` (página Vendas Online)

### 3a. Nova seção "Produtos vendidos" (abaixo da tabela e dos KPIs)

Tabela com colunas:
- ID (#numero)
- Descrição
- Valor (BRL)
- Forma de pagamento (badge: PIX, etc.)
- Status venda (badge "Vendido" / "Pago")
- Cliente: Nome + CPF (com tooltip mostrando email/telefone)
- **Local** — `<Select>` com os locais ativos do tenant; "— sem local —" como opção; on change → `update chamado_denis_itens set local_id`
- **Entregue?** — Badge "Sim" / "Não"
- **Ação entrega** — ícone (Truck/PackageCheck). Por enquanto: toggle simples que marca `entregue=true`, `entregue_em=now()`, `entregue_por=auth.uid()`. (Detalhamento no próximo prompt — apenas placeholder funcional.)

Filtros locais à seção:
- Busca por nome/CPF/descrição
- Filtro por local (todos / sem local / cada local)
- Filtro por entrega (todos / pendente / entregue)

Critério de "vendido" para esta seção: `status = 'vendido'` **OU** `abacate_status = 'PAID'`.

### 3b. Sub-seção "Locais cadastrados" (abaixo da tabela de vendidos)

Card com:
- Lista dos locais (nome, descrição, toggle ativo, botão excluir)
- Input + botão "Adicionar local"
- Edição inline do nome (mesmo padrão das células editáveis já existente)

Realtime: assinar `postgres_changes` em `vendas_online_locais` filtrando por `tenant_id`.

## 4. Tipos / queries

- Atualizar `SELECT_COLS` para incluir `local_id, entregue, entregue_em, forma_pagamento, pagador_*` (já há a maioria).
- Hook/load separado para `locais` (`useEffect` carregando lista quando `tenantId` muda).

## 5. Fora de escopo (próximo prompt)

- Fluxo detalhado de entrega (confirmação, assinatura, comprovante, registro de quem retirou, etc.)
- Notificação ao cliente quando produto é alocado/entregue

## Arquivos afetados

- `supabase/migrations/<novo>.sql` — tabela `vendas_online_locais` + colunas em `chamado_denis_itens` + RLS
- `supabase/functions/vendas-online-webhook/index.ts` — gravar `forma_pagamento`
- `src/pages/ChamadoDenis.tsx` — nova seção "Produtos vendidos" + gerenciamento de locais
