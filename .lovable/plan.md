

# Corrigir Exibição de Conversas de Grupo

## Problema
Em conversas de grupo no WhatsApp:
- O **título** mostra o nome de quem mandou a última mensagem em vez do nome do grupo
- O **subtítulo** mostra apenas a mensagem, sem identificar quem enviou

**Como deveria ser:** Título = nome do grupo, Subtítulo = "Fulano: mensagem..."

## Causa Raiz
1. O webhook (`zapi-webhook`) cria/atualiza o contato usando `senderName` (nome da pessoa) como `nome`, mas para grupos deveria usar `chatName` (nome do grupo)
2. O `ultimo_texto` salva apenas a mensagem crua, sem prefixo do remetente
3. O sync (`handleSync`) filtra grupos com `@g.us`, ignorando-os completamente

## Alterações

### 1. `supabase/functions/zapi-webhook/index.ts`
- Detectar se é grupo verificando se `payload.isGroup === true` ou se o phone contém `@g.us`
- Para grupos: usar `payload.chatName` (nome do grupo) como nome do contato, não `senderName`
- Para grupos: salvar `ultimo_texto` como `"NomeRemetente: mensagem"` (truncado)
- Para individuais: manter comportamento atual

### 2. `src/pages/Conversas.tsx` — `handleSync`
- Remover filtro que exclui grupos (`@g.us`)
- Para chats de grupo: usar `chat.name` como nome do contato (grupo)
- Para grupos no sync de mensagens: salvar `ultimo_texto` como `"Remetente: msg"`
- Formatar `ultimo_texto` histórico com nome do remetente quando disponível

### 3. `src/pages/Conversas.tsx` — `handleSend` (envio manual)
- Ao atualizar `ultimo_texto` após envio do atendente, prefixar com "Você: mensagem"

## Nenhuma migration necessária
Os campos já existem. A mudança é apenas na lógica de como os dados são salvos.

## Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/zapi-webhook/index.ts` | Diferenciar grupo vs individual no nome do contato e ultimo_texto |
| `src/pages/Conversas.tsx` | Permitir sync de grupos + prefixar ultimo_texto com remetente |

