# Fixar conversas no painel de Conversas

Permitir que o atendente "fixe" suas conversas no topo da lista, com regras alinhadas ao WhatsApp.

## Regras de negócio

- Só pode fixar quem é o **atendente da conversa** (`atendente_id = auth.uid()`). Se a conversa não tem atendente ou pertence a outro, o botão não aparece.
- Cada usuário fixa para si mesmo (fixação por usuário, não global no tenant).
- Ao **encerrar a conversa** (status vira `fechada`), a fixação é removida automaticamente.
- Ao **transferir** para outro atendente, a fixação do antigo atendente também é removida (mantém consistência da regra "só fixa quem está com a conversa").
- Conversas fixadas aparecem no **topo** da lista, ordenadas entre si por `ultima_msg_at desc`. Demais conversas seguem a ordem atual.
- Ícone usado: `Pin` do `lucide-react` (mesmo formato do alfinete do WhatsApp). Quando fixada, usa `PinOff` no botão (toggle) e mostra um pequeno `Pin` ao lado do horário no `ConversaItem`.

## Banco de dados

Nova tabela `conversa_fixacoes` (fixação por usuário):

```sql
create table public.conversa_fixacoes (
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  user_id uuid not null,
  tenant_id uuid not null,
  fixada_at timestamptz not null default now(),
  primary key (conversa_id, user_id)
);
```

- RLS: SELECT/INSERT/DELETE somente quando `user_id = auth.uid()` e `tenant_id` pertence ao usuário (mesmo padrão das demais tabelas do projeto).
- Índice em `(user_id, tenant_id)` para o join na listagem.

Trigger / lógica para limpar fixação:

- Trigger `AFTER UPDATE` em `conversas` que, quando `status` muda para `fechada` OU `atendente_id` muda, executa `DELETE FROM conversa_fixacoes WHERE conversa_id = NEW.id` (no caso de troca de atendente, apaga a fixação do atendente antigo).

## Backend / dados na listagem

`fetchConversas` em `src/pages/Conversas.tsx`:

- Após carregar `conversas`, buscar `conversa_fixacoes` do usuário atual:
  `select conversa_id from conversa_fixacoes where user_id = auth.uid()`.
- Marcar `fixada: true` nas conversas correspondentes.
- Ordenar: `fixada desc, ultima_msg_at desc`.

## UI

### `src/components/conversas/ChatPanel.tsx`

Adicionar botão Pin/PinOff entre "Marcar como não lida" e "Encerrar conversa":

- Props novas: `isPinned?: boolean`, `onTogglePin?: () => void`.
- Renderizar somente quando `isAssignedToMe` for `true` (espelhando a regra do botão de encerrar).
- Ícone `Pin` quando não fixada (title "Fixar conversa"), `PinOff` quando fixada (title "Desafixar conversa").

### `src/components/conversas/ConversaItem.tsx`

- Nova prop `fixada?: boolean`.
- Quando `fixada`, mostrar um `<Pin className="h-3 w-3 text-muted-foreground" />` rotacionado 45° à direita do horário (igual WhatsApp).

### `src/components/conversas/ConversasList.tsx` e `Conversas.tsx`

- Propagar `fixada` no tipo `Conversa`.
- `Conversas.tsx`: novo handler `handleTogglePin` — insere/deleta em `conversa_fixacoes`, atualiza estado local e re-ordena.
- Ajustar ordenação local (sort estável) para respeitar `fixada` no topo.
- Em `handleClose` e `handleTransfer`/`handleTransferDepartamento`, atualizar estado local removendo `fixada` (o trigger já cuida do banco).

## Arquivos afetados

- `supabase/migrations/<novo>.sql` — tabela, RLS, trigger.
- `src/pages/Conversas.tsx` — fetch fixações, handler, propagação.
- `src/components/conversas/ConversasList.tsx` — tipo + ordenação + prop.
- `src/components/conversas/ConversaItem.tsx` — ícone de pin no item.
- `src/components/conversas/ChatPanel.tsx` — botão pin/unpin no header.
- `src/integrations/supabase/types.ts` — atualizado automaticamente pela migração.
