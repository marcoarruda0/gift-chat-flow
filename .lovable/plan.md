

# Marcar Conversa como Não Lida

## Objetivo
Adicionar botão no header do chat que marca a conversa como "não lida", exibindo um ponto verde (sem contador) na lista lateral — igual ao comportamento do WhatsApp.

## Alterações

### 1. Coluna `marcada_nao_lida` na tabela `conversas`

- Nova coluna `marcada_nao_lida` (boolean, default false)
- Usada para diferenciar "não lida manual" (ponto verde) de "mensagens novas" (bola com número)

### 2. ChatPanel — Botão "Marcar como não lida"

- Novo botão com ícone `MailOpen` / `Mail` (lucide) ao lado do botão de transferir
- Nova prop `onMarkUnread` chamada ao clicar
- Tooltip: "Marcar como não lida"

### 3. Conversas.tsx — Lógica

- `handleMarkUnread`: faz `UPDATE conversas SET marcada_nao_lida = true` e deseleciona a conversa
- No `useEffect` que zera `nao_lidas` ao abrir, também faz `marcada_nao_lida = false` (limpa ao abrir)
- Passa a prop `onMarkUnread` ao `ChatPanel`

### 4. ConversaItem — Ponto verde

- Receber nova prop `marcadaNaoLida`
- Quando `marcadaNaoLida === true` e `naoLidas === 0`: exibir um **ponto verde** (`h-[10px] w-[10px] rounded-full bg-[#25D366]`) no lugar da bola com número
- Quando `naoLidas > 0`: comportamento atual (bola com contador)

### 5. ConversasList — Passar prop

- Passar `marcadaNaoLida` da conversa para o `ConversaItem`

## Arquivos

| Arquivo | Tipo |
|---------|------|
| Migration (coluna `marcada_nao_lida`) | Novo |
| `src/components/conversas/ChatPanel.tsx` | Alterado |
| `src/pages/Conversas.tsx` | Alterado |
| `src/components/conversas/ConversaItem.tsx` | Alterado |
| `src/components/conversas/ConversasList.tsx` | Alterado |

