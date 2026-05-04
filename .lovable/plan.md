# Vendas Online — Limpeza por seleção + ID de integração

## Resumo das decisões

- **Seleção manual** com checkbox por linha + checkbox "selecionar todos" no cabeçalho.
- **Hard delete** dos itens selecionados.
- Itens com `status = 'vendido'` (aparecem em "Produtos vendidos") **não podem ser limpos** — checkbox bloqueado.
- **Numeração mantém o "slot"**: ao deletar o item #5, o número 5 fica vago. O trigger atual (`set_chamado_denis_numero`) usa `MAX(numero)+1` por tenant, então novos itens continuam crescendo a partir do maior existente. Não vamos alterar o trigger — itens deletados simplesmente liberam visualmente a posição, sem reaproveitar.
- **ID de integração**: o próprio campo `numero` (coluna #) será o identificador a vincular ao sistema externo. Vamos destacá-lo na UI e adicionar botão "copiar".

## 1. Tabela principal — seleção em massa

Em `src/pages/ChamadoDenis.tsx` (seção "Vendas online"):

- Adicionar coluna **checkbox** como primeira coluna da tabela.
  - Cabeçalho: checkbox "selecionar todos" (marca/desmarca apenas linhas elegíveis = não-vendidas da página atual).
  - Linha: checkbox habilitado quando `item.status !== 'vendido'`. Quando vendido: checkbox **desabilitado** com tooltip "Item vendido — gerencie em Produtos vendidos".
- Estado: `const [selecionados, setSelecionados] = useState<Set<string>>(new Set())`.
- Botão de ação no header da seção: **"Limpar selecionados (N)"** — visível apenas quando `selecionados.size > 0`. Usa variante `destructive`.
- Ao clicar, abrir `AlertDialog` de confirmação:
  - Texto: "Tem certeza? Esta ação removerá permanentemente N item(ns) do sistema. Itens vendidos não serão afetados."
  - Confirmar → `supabase.from('chamado_denis_itens').delete().in('id', [...]).neq('status','vendido')` (dupla proteção: filtro client + server).
  - Após sucesso: limpar seleção, recarregar lista, toast de sucesso.

## 2. Coluna # como ID de integração

- Renomear o cabeçalho da coluna `#` para **"ID"** (ou manter `#` mas com tooltip explicando).
- Renderizar o número em **fonte mono + destacado** (ex.: `font-mono font-semibold text-primary`).
- Adicionar botão pequeno "copiar" (ícone `Copy` do lucide) ao lado, que copia o número para o clipboard via `navigator.clipboard.writeText(String(item.numero))` + toast "ID copiado".
- Aplicar o mesmo destaque também na tabela "Produtos vendidos" para consistência.

## 3. Comportamento esperado

- Numeração **não é renumerada** após delete. Se hoje você tem 1,2,3,4,5 e apaga o 3, ficam 1,2,4,5 e o próximo criado será 6.
- Itens vendidos preservados: aparecem em "Produtos vendidos" e ficam visíveis (com checkbox cinza/desabilitado) na lista principal **se ainda não tiverem sido movidos** — confirmar comportamento atual: verificarei se a aba "Vendas online" já filtra `status != 'vendido'`. Se sim, o problema da proteção fica naturalmente resolvido (não há vendidos para selecionar). Se não, mantém a checagem `disabled`.

## Arquivos afetados

- `src/pages/ChamadoDenis.tsx` — checkbox por linha, header com "Limpar selecionados", `AlertDialog`, destaque + copiar do `numero`.
- Sem migration: usaremos `DELETE` via cliente (RLS já permite `tenant_delete_chamado_denis`).
- Sem mudanças em `src/components/ui/*`.

## Fora de escopo
- Renumerar/compactar IDs após limpeza.
- Auditoria das limpezas (poderíamos adicionar log futuramente, similar ao de entregas).
- Limpeza por filtro/data (apenas seleção manual nesta etapa).
