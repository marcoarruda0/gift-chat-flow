

# Fase 5 — Sincronizar WhatsApp (Importar Chats via Z-API)

## Visao Geral
Adicionar botao "Sincronizar WhatsApp" na lista de conversas que chama o endpoint Z-API `chats` via proxy, importa contatos e cria conversas automaticamente.

## Alteracoes

### 1. `src/components/conversas/ConversasList.tsx`
- Adicionar prop `onSync` e botao com icone `RefreshCw` ao lado do botao de nova conversa
- Mostrar estado de loading durante sync (spinner no botao)

### 2. `src/pages/Conversas.tsx`
- Adicionar funcao `handleSync` que:
  1. Chama `zapi-proxy` com endpoint `chats` (GET) para listar chats do WhatsApp
  2. Para cada chat retornado:
     - Busca contato pelo telefone no banco (`contatos` table)
     - Se nao existe, cria contato com nome do chat e telefone
     - Busca conversa aberta existente para o contato
     - Se nao existe, cria conversa com `ultimo_texto` e `ultima_msg_at` do chat
  3. Atualiza `avatar_url` do contato se disponivel no chat
  4. Exibe toast com resultado ("X conversas importadas")
- Adicionar estado `syncing` para controlar loading do botao
- Passar `onSync` e `syncing` para `ConversasList`

### 3. Sem migration necessaria
Todas as tabelas ja existem. A logica usa apenas INSERT/SELECT nas tabelas `contatos` e `conversas`.

## Fluxo
1. Usuario clica "Sincronizar WhatsApp"
2. Sistema busca chats via Z-API proxy
3. Para cada chat: cria ou encontra contato → cria ou encontra conversa
4. Lista de conversas atualiza automaticamente
5. Toast mostra quantas conversas foram importadas

## Endpoint Z-API usado
- `GET /chats` — retorna array de chats com `phone`, `name`, `profilePicture`, `lastMessage`

