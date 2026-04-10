

# Corrigir Barras de Rolagem no Módulo Conversas

## Problema
O layout atual usa `min-h-screen` no container raiz, permitindo que o conteúdo cresça além da viewport e gere uma barra de rolagem geral da página. O correto é que a lista de conversas e o painel de chat tenham cada um sua própria barra de rolagem independente, sem scroll na página.

## Causa Raiz
- `AppLayout` usa `min-h-screen` no container raiz — deveria ser `h-screen` para o módulo Conversas
- O `<main>` tem `overflow-auto` mas sem altura fixa, o conteúdo transborda
- A página Conversas usa `h-full` mas o pai não restringe a altura

## Alterações

### 1. `src/components/AppLayout.tsx`
- Trocar `min-h-screen` por `h-screen` no container raiz
- Adicionar `overflow-hidden` no container raiz para evitar scroll da página
- Trocar `overflow-auto` do `<main>` por `overflow-hidden` quando `noPadding` (indica tela cheia como Conversas)

### 2. `src/pages/Conversas.tsx`
- Confirmar que o container principal já usa `h-full` (já está)
- Os componentes filhos (`ConversasList` e `ChatPanel`) já têm `ScrollArea` internos — vão funcionar corretamente quando a altura for restrita

Resultado: lista de conversas com scroll independente à esquerda, chat com scroll independente à direita, sem scroll geral da página.

