# Vendas Online — Slots fixos com limpeza por reset

## Mudança de paradigma

Hoje cada item é uma linha que pode ser criada/deletada. Vamos virar **slots permanentes**: o `numero` é a "linha da planilha" e nunca some — apenas o conteúdo é limpo. ID estável para integração externa.

## 1. Banco — slots fixos por tenant

**Migration**:

- Adicionar coluna `total_slots integer NOT NULL DEFAULT 99` em `vendas_online_config`.
- Criar função `seed_chamado_denis_slots(p_tenant_id uuid)`: insere os slots `1..total_slots` faltantes com `status='disponivel'`, `descricao=''`, `valor=0`. Usa `ON CONFLICT (tenant_id, numero) DO NOTHING`.
- Adicionar `UNIQUE (tenant_id, numero)` em `chamado_denis_itens` (necessário para o ON CONFLICT). Hoje o trigger `set_chamado_denis_numero` garante isso por incremento, mas sem constraint.
- Trigger `AFTER INSERT` em `vendas_online_config`: chama `seed_chamado_denis_slots(NEW.tenant_id)`.
- **Backfill**: para cada `tenant_id` em `vendas_online_config` (ou `chamado_denis_itens`), chamar `seed_chamado_denis_slots`. Hoje há 1 tenant com 8 itens — vai completar para 99.
- Função `reset_chamado_denis_slot(p_item_id uuid)` (SECURITY DEFINER, valida tenant): zera `descricao=''`, `valor=0`, `status='disponivel'`, `local_id=null`, `forma_pagamento=null`, `entregue=false`, todos os campos de pagador (`pagador_*`), pagamento (`pago_em`, `abacate_*`), e entrega (`entregue_*`). **Preserva**: `id`, `tenant_id`, `numero`, `created_at`.
- Trigger `BEFORE INSERT` adicional em `chamado_denis_itens`: bloquear inserts manuais via cliente quando já existem `total_slots` para o tenant (proteção extra; ou simplesmente revogar permissão de INSERT do role `authenticated` e deixar só o seed via SECURITY DEFINER).

## 2. Frontend — `src/pages/ChamadoDenis.tsx`

**Listagem**:
- Já carrega ordenado por `numero` ASC — mantém. Vai mostrar todos os 99 slots.
- Slot vazio (status `disponivel` + `descricao===''` + `valor===0`): linha com aparência "vazia" (descrição em itálico cinza "— vazio —", botão "Preencher" inline que abre o editor de descrição/valor).
- Filtros existentes (`busca`, status) continuam funcionando — busca por número fica útil.

**Botão "Limpar selecionados (N)"**:
- Substituir o `delete` atual por chamada à RPC `reset_chamado_denis_slot` em loop (ou criar `reset_chamado_denis_slots(p_ids uuid[])` que faz tudo numa transação — preferido).
- Permite selecionar **vendidos também** (remove o `disabled` no checkbox). Histórico do vendido permanece em "Produtos vendidos" porque vem de `compras` / `giftback_movimentos`, não de `chamado_denis_itens`.
- Texto do `AlertDialog` muda para: *"Tem certeza? Os dados de N slot(s) serão apagados. Os IDs (#) serão preservados para uso futuro. Vendas já registradas continuam disponíveis em 'Produtos vendidos'."*

**Remover criação manual**:
- Remover botão "Adicionar item" e função `criarItem`.
- Remover `deletarItem` individual (slots não são deletados, só resetados). Substituir por ação "Limpar este slot" no menu da linha (mesma RPC com 1 id).

**Realtime**:
- Já assina `*` na tabela — UPDATEs do reset já refletem automaticamente.

## 3. Config UI — `src/pages/VendasOnlineConfig.tsx`

- Novo campo "Quantidade de slots" (input numérico, padrão 99, min 1, max 999).
- Ao salvar com valor maior que o atual: chama `seed_chamado_denis_slots` para criar os novos.
- Ao salvar com valor **menor**: bloqueia se algum slot acima do novo limite tiver `status != 'disponivel'` ou conteúdo. Toast: "Limpe os slots X..Y antes de reduzir." Se todos estiverem vazios, deleta-os.

## Comportamento resultante

```text
Antes:  [1][2][3][4][5]                      ← 5 itens, deletar #3 vira [1][2][4][5]
Depois: [1][2][3][4][5][6]...[99]            ← 99 slots fixos
        Limpar #3 → [1][2][3:vazio][4][5]    ← #3 continua, pronto pra reuso
```

ID `#3` sempre aponta para o mesmo slot lógico — seguro para vincular ao sistema externo.

## Arquivos afetados

- `supabase/migrations/<nova>.sql` — coluna `total_slots`, unique, funções `seed_*` e `reset_*`, trigger, backfill, revogação de INSERT direto.
- `src/pages/ChamadoDenis.tsx` — RPC reset, remover criar/deletar, render de slot vazio, AlertDialog atualizado, permitir selecionar vendidos.
- `src/pages/VendasOnlineConfig.tsx` — campo "Quantidade de slots".
- `src/integrations/supabase/types.ts` — auto-regenerado.

## Fora de escopo

- Migrar histórico (não há — `chamado_denis_entregas_log` aponta por `item_id` que continua existindo).
- Renumeração / reordenação manual de slots.
- Importação/exportação em massa de slots.
