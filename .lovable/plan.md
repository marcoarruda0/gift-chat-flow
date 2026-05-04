## Problema

A função "Limpar selecionados" (e o botão de limpar slot individual) chama a RPC `reset_chamado_denis_slots`, que **reseta qualquer slot recebido**, incluindo os com `status = 'vendido'`. Isso apaga descrição, valor, dados do pagador e o vínculo com o billing — fazendo o item desaparecer da aba **"Produtos vendidos"** (que filtra por `status === 'vendido'`).

A regra correta: slots vendidos **nunca** devem ser limpos por essa ação. Só devem ser reaproveitáveis quando o usuário explicitamente alterar o status para "disponível".

## Mudanças

### 1. Backend — proteger a RPC (migration nova)

Atualizar `public.reset_chamado_denis_slots` para ignorar itens com `status = 'vendido'` no `UPDATE`:

```sql
UPDATE public.chamado_denis_itens
SET descricao = '', valor = 0, status = 'disponivel', ...
WHERE id = ANY(p_ids)
  AND status <> 'vendido'                      -- novo
  AND (tenant_id = v_tenant OR public.has_role(auth.uid(), 'admin_master'));
```

A função continua retornando o número de linhas efetivamente limpas (via `GET DIAGNOSTICS`). Defesa em profundidade: mesmo que o frontend mande um vendido, o banco recusa.

### 2. Frontend — `src/pages/ChamadoDenis.tsx`

**a) Filtrar a seleção em massa** — em `elegiveisLimpeza` (linha 373), excluir vendidos para que:
- O checkbox "selecionar todos" não marque vendidos.
- A linha de cada item vendido não exiba o checkbox de seleção (ou exiba desabilitado com tooltip "Item vendido — limpe alterando o status para Disponível primeiro").

**b) `toggleSelecionado`** — bloquear adição de IDs vendidos ao set (guard simples).

**c) `resetSlot` (limpar individual, linha 344)** — se o item estiver vendido, mostrar `toast.error("Não é possível limpar um produto vendido. Altere o status para Disponível antes.")` e abortar antes do confirm.

**d) `limparSelecionados` (linha 390)** — filtrar `ids` removendo vendidos antes de chamar a RPC; se sobrar zero, avisar e cancelar.

**e) Texto do `AlertDialog` (linha 953)** — ajustar a contagem para refletir apenas os elegíveis e adicionar a frase: *"Slots vendidos foram ignorados e permanecerão em 'Produtos vendidos'."* quando algum vendido tiver sido filtrado.

### 3. Sem mudança no schema

Nenhuma coluna nova. Só uma migration alterando a função RPC.

## Validação

1. Selecionar mistura de slots disponíveis + vendidos → "Limpar" só apaga os disponíveis; vendidos continuam na aba "Produtos vendidos".
2. Tentar limpar um slot vendido individualmente → toast de erro, nada muda.
3. Alterar status de um vendido para "disponível" e então limpar → funciona normalmente.
