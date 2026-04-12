

# Correções e Melhorias no Módulo Conversas

## Problema 1: Badge de não lidas não atualiza
Quando o usuário abre uma conversa com mensagens não lidas, o contador verde na lista lateral não zera. Motivo: não existe nenhum código que faça `UPDATE conversas SET nao_lidas = 0` ao selecionar/abrir uma conversa.

## Problema 2: Sem seletor de emojis
A barra de input de mensagens não possui um botão de emoji com biblioteca para seleção rápida.

---

## Alterações

### 1. Zerar `nao_lidas` ao abrir conversa (`Conversas.tsx`)

- No `useEffect` que dispara quando `selectedId` muda, após buscar mensagens, executar:
  ```sql
  UPDATE conversas SET nao_lidas = 0 WHERE id = selectedId
  ```
- Atualizar o estado local `conversas` para refletir imediatamente (sem esperar refetch)

### 2. Emoji Picker no ChatInput (`ChatInput.tsx`)

- Instalar `emoji-mart` (ou `@emoji-mart/react` + `@emoji-mart/data`) — biblioteca leve e popular de emojis
- Adicionar botão `Smile` (lucide) à esquerda do textarea
- Ao clicar, abrir um `Popover` com o componente `<Picker>` do emoji-mart
- Ao selecionar emoji, inserir no texto na posição do cursor
- Fechar popover após seleção

### 3. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Conversas.tsx` | Adicionar reset de `nao_lidas` ao selecionar conversa |
| `src/components/conversas/ChatInput.tsx` | Adicionar botão emoji + Popover com picker |
| `package.json` | Adicionar dependência `@emoji-mart/react` e `@emoji-mart/data` |

## Detalhes Técnicos

- O reset de `nao_lidas` é feito tanto no banco (update) quanto no state local (para UI instantânea)
- O emoji-mart renderiza a biblioteca completa de emojis com categorias, busca e skins — visual nativo
- O Popover usa o componente shadcn/ui já existente no projeto
- O emoji é inserido na posição atual do cursor via `selectionStart` do textarea

