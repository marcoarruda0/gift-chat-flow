## Chamado Vendas Online — Tabela editável estilo Excel

Criar um novo módulo onde o usuário gerencia itens em uma tabela inline-editable (parecida com Excel/Google Sheets), com persistência por tenant no Lovable Cloud.

### Colunas

- **ID** — auto-incrementado por tenant (1, 2, 3…), somente leitura
- **Descrição** — texto livre, editável inline
- **Valor** — numérico (R$), editável inline com máscara BRL
- **Status** — dropdown inline: `disponível` | `vendido`

### UX (Excel-like)

- Toda célula editável ao clicar (ou duplo clique); `Enter` salva e desce para a próxima linha; `Tab` salva e vai para a próxima coluna; `Esc` cancela.
- Auto-save por célula (debounce ~500ms) — sem botão "Salvar" por linha.
- Linha vazia permanente no fim ("nova linha"): ao digitar nela cria-se um novo registro automaticamente.
- Botão "Nova linha" e "Excluir" (ícone lixeira por linha, com confirmação rápida).
- Filtro por status + busca por descrição no topo.
- Totalizador no rodapé: contagem por status + soma de "Valor" dos disponíveis e dos vendidos.
- Badges coloridos para status (verde = disponível, cinza = vendido).

### Backend (Lovable Cloud)

Nova tabela `chamado_denis_itens`:

```text
id              uuid pk
tenant_id       uuid not null  → FK lógico tenants
numero          int  not null  → ID visível, sequencial por tenant
descricao       text
valor           numeric(12,2) default 0
status          text default 'disponivel'  (check: 'disponivel'|'vendido')
created_at      timestamptz default now()
updated_at      timestamptz default now()
unique (tenant_id, numero)
```

- Trigger `BEFORE INSERT` para preencher `numero = COALESCE(MAX(numero),0)+1` por tenant.
- Trigger `BEFORE UPDATE` para atualizar `updated_at`.
- RLS habilitada com políticas seguindo o padrão do projeto:
  - SELECT/INSERT/UPDATE/DELETE permitidos quando `tenant_id = (select tenant_id from profiles where id = auth.uid())` OU `has_role(auth.uid(),'admin_master')`.

### Rota e navegação

- Rota: `/chamado-denis` em `src/App.tsx` (protegida).
- Item no `AppSidebar` com ícone `ClipboardList` (lucide), visível para todos os usuários autenticados do tenant.

### Arquivos a criar/editar

- `supabase/migrations/<timestamp>_chamado_denis.sql` — tabela, triggers, RLS.
- `src/pages/ChamadoDenis.tsx` — página com a tabela editável.
- `src/components/chamado-denis/EditableCell.tsx` — célula genérica (texto/número/select) com handlers de teclado.
- `src/App.tsx` — registrar a rota.
- `src/components/AppSidebar.tsx` — adicionar item de menu.

### Detalhes técnicos

- shadcn `Table` + inputs nativos para edição inline (mais leve que libs externas).
- `valor` formatado como BRL na exibição; em edição vira input `type="number"` com 2 decimais.
- Realtime opcional (postgres_changes) para refletir mudanças entre abas — manter desligado no MVP.
- Validação com zod antes do upsert (descricao ≤ 500 chars, valor ≥ 0, status ∈ enum).