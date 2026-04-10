

# Importar Mensagens Historicas do WhatsApp via Z-API

## Situacao Atual
A sincronizacao atual importa apenas os **chats** (conversas) via `GET /chats`, criando contatos e conversas, mas **nao importa as mensagens** de cada chat.

## Endpoint Z-API Disponivel
A Z-API oferece o endpoint `GET /chats/{phone}` que retorna metadata do chat. Para mensagens historicas, o endpoint correto e:

```
GET /instances/{instanceId}/token/{token}/chat-messages/{phone}
```

Este endpoint retorna as mensagens armazenadas no cache do WhatsApp para aquele contato.

## Plano de Implementacao

### 1. Atualizar `handleSync` em `src/pages/Conversas.tsx`
Apos criar/encontrar cada conversa durante a sincronizacao, buscar as mensagens historicas daquele contato:

- Chamar `zapi-proxy` com endpoint `chat-messages/{phone}` para cada chat importado
- Para cada mensagem retornada, inserir na tabela `mensagens` (evitando duplicatas)
- Mapear os campos da Z-API para o schema local:
  - `fromMe: true` → remetente = `atendente`
  - `fromMe: false` → remetente = `contato`
  - `body` ou `text` → conteudo
  - `timestamp` → created_at
- Usar o campo `messageId` da Z-API como chave para evitar duplicatas (salvar em `metadata.zapi_message_id`)

### 2. Limitar volume
- Importar no maximo as ultimas 50 mensagens por conversa para evitar timeout
- Adicionar indicador de progresso no toast (ex: "Importando mensagens 3/10...")

### 3. Controle de duplicatas
- Antes de inserir cada mensagem, verificar se ja existe uma com o mesmo `metadata->>'zapi_message_id'`
- Isso permite rodar a sincronizacao multiplas vezes sem duplicar mensagens

### 4. Nenhuma migration necessaria
A tabela `mensagens` ja tem o campo `metadata jsonb` que pode armazenar o `zapi_message_id`.

## Arquivos alterados
| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Conversas.tsx` | Adicionar busca de mensagens no loop do `handleSync` |

## Fluxo
1. Usuario clica "Sincronizar WhatsApp"
2. Sistema importa chats (como ja faz)
3. Para cada chat importado, busca ultimas mensagens via `chat-messages/{phone}`
4. Insere mensagens no banco evitando duplicatas
5. Toast mostra resultado com contagem de mensagens importadas

