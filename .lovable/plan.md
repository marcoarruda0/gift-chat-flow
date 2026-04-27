## Plano de Implementação

### 1. Unificar Relatórios em uma única página com tabs (Giftback / Atendimentos / CRM)

**Nova página `src/pages/Relatorios.tsx`**:
- Wrapper com `Tabs` (shadcn) com 3 abas superiores: **Giftback**, **Atendimentos**, **CRM**.
- Persistir tab selecionada em `localStorage` (`relatorios_tab`) e via query param `?tab=` (para deep-links).
- Renderizar os componentes existentes `RelatorioGiftback` e `RelatorioAtendimento` reaproveitando 100% do conteúdo (vou refatorá-los levemente removendo o `Navigate to="/"` interno e o controle de admin, que passará para a página pai `Relatorios.tsx`).

**Roteamento (`src/App.tsx`)**:
- Adicionar `/relatorios` apontando para `Relatorios`.
- Manter `/relatorios/giftback` e `/relatorios/atendimento` redirecionando para `/relatorios?tab=giftback|atendimento` (compatibilidade).

**Sidebar (`src/components/AppSidebar.tsx`)**:
- Substituir os dois itens "Relatório Atendimento" e "Relatório Giftback" por um único item **"Relatórios"** (ícone `BarChart3`) apontando para `/relatorios`. Mantém visibilidade só para admin_tenant/admin_master.

### 2. Nova aba "CRM" dentro de Relatórios

Componente novo `src/components/relatorios/RelatorioCRM.tsx`:
- Filtra apenas contatos **clientes** (campo personalizado booleano `cliente = true` em `campos_personalizados`).
- Cards de métricas mostrando **% de clientes com**:
  - **Gênero preenchido** (`genero IS NOT NULL AND genero <> ''`)
  - **Data de nascimento preenchida** (`data_nascimento IS NOT NULL`)
  - **Email preenchido** (`email IS NOT NULL AND email <> ''`)
- Cada card mostra: percentual grande, "X de Y clientes", barra de progresso.
- Card adicional com totais: total de contatos, total de clientes, total de fornecedores (visão geral rápida).
- Query: `select genero, data_nascimento, email, campos_personalizados from contatos` filtrado pelo tenant, depois cálculo client-side.

### 3. Colunas "Cliente" e "Fornecedor" em Contatos

Em `src/pages/Contatos.tsx`:
- Adicionar 2 novas colunas na tabela: **Cliente** e **Fornecedor**, exibindo badge `S` (verde) ou `N` (cinza claro), responsivo `hidden md:table-cell`.
- Ler valores de `campos_personalizados.cliente` e `campos_personalizados.fornecedor` (chaves geradas pela função `campoKey` existente).
- Incluir as colunas também no `exportCSV`.

### 4. Excluir o marcador "Cliente e Fornecedor"

- Desativar/excluir o campo `Cliente e Fornecedor` da tabela `contato_campos_config` (via tool de insert SQL com `DELETE` ou `UPDATE ativo=false`). **Sugestão: DELETE** — limpa o cadastro. Os valores antigos em `campos_personalizados.cliente_e_fornecedor` ficam órfãos no JSONB mas não atrapalham; podem ser limpos opcionalmente com `UPDATE contatos SET campos_personalizados = campos_personalizados - 'cliente_e_fornecedor'`.

### Pergunta para o usuário

**Sobre o cálculo de "% clientes" na aba CRM**: o filtro deve considerar como cliente quem tem `campos_personalizados.cliente = true`, OU também considerar quem tem qualquer compra registrada na tabela `compras` (mesmo que o checkbox "Cliente" não esteja marcado)?
- (a) **Apenas o checkbox "Cliente"** (mais simples, fiel ao cadastro manual) — **default se você não responder**.
- (b) Cliente = checkbox marcado **OU** tem ≥ 1 compra (mais abrangente).

### Arquivos afetados

**Novos:**
- `src/pages/Relatorios.tsx`
- `src/components/relatorios/RelatorioCRM.tsx`

**Modificados:**
- `src/App.tsx` (rota nova + redirects)
- `src/components/AppSidebar.tsx` (item único "Relatórios")
- `src/pages/Contatos.tsx` (2 colunas novas + export)
- `src/pages/RelatorioGiftback.tsx` e `src/pages/RelatorioAtendimento.tsx` (remover o `Navigate` interno e título redundante; lógica fica)

**Banco (via insert tool):**
- `DELETE FROM contato_campos_config WHERE nome = 'Cliente e Fornecedor'`
- (opcional) `UPDATE contatos SET campos_personalizados = campos_personalizados - 'cliente_e_fornecedor' WHERE campos_personalizados ? 'cliente_e_fornecedor'`