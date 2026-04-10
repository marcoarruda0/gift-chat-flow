

# Mostrar Remetente em Mensagens de Grupo

## Problema
Nas conversas de grupo, todas as mensagens aparecem sem identificação de quem enviou. No WhatsApp, cada mensagem mostra o nome e foto do remetente.

## Solução
Armazenar informações do remetente (nome e foto) no campo `metadata` (jsonb) da tabela `mensagens` e exibir essas informações na bolha de mensagem para mensagens recebidas.

## Alterações

### 1. `src/components/conversas/MessageBubble.tsx`
- Adicionar props `senderName` e `senderAvatar` (opcionais)
- Para mensagens recebidas (`remetente === "contato"`), quando `senderName` estiver presente:
  - Exibir mini avatar à esquerda da bolha
  - Exibir nome do remetente em cor destaque acima do conteúdo (como no WhatsApp — cada nome com cor diferente baseada em hash)
- Layout: avatar pequeno (24px) + bolha com nome + conteúdo

### 2. `src/components/conversas/ChatPanel.tsx`
- Extrair `senderName` e `senderAvatar` do campo `metadata` de cada mensagem
- Passar para `MessageBubble`

### 3. `src/pages/Conversas.tsx` — Interface `MensagemRow`
- Adicionar campo `metadata` ao tipo e ao fetch de mensagens

### 4. `supabase/functions/zapi-webhook/index.ts`
- Para mensagens recebidas, salvar `senderName` (de `payload.senderName` ou `payload.chatName`) e `senderPhoto` no `metadata` da mensagem

### 5. Sync histórico em `src/pages/Conversas.tsx` (`handleSync`)
- Ao importar mensagens históricas, salvar `senderName` do campo `msg.senderName` ou `msg.sender.name` no metadata

## Sem migration
O campo `metadata jsonb` já existe na tabela `mensagens`. Basta salvar `{ senderName, senderAvatar, zapi_message_id }`.

## Arquivos alterados
| Arquivo | Tipo |
|---------|------|
| `src/components/conversas/MessageBubble.tsx` | Alterado |
| `src/components/conversas/ChatPanel.tsx` | Alterado |
| `src/pages/Conversas.tsx` | Alterado (tipo + sync) |
| `supabase/functions/zapi-webhook/index.ts` | Alterado |

