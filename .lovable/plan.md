

# Sincronização de Mensagens Enviadas pelo WhatsApp

## Problema
Quando o atendente envia uma mensagem diretamente pelo WhatsApp (celular ou WhatsApp Web), essa mensagem não aparece no sistema. O webhook atual só processa mensagens recebidas (`payload.phone` + conteúdo), ignorando mensagens enviadas pelo próprio número.

## Solução
A Z-API envia webhooks também para mensagens enviadas pelo próprio número, com o campo `payload.fromMe = true`. Atualmente o webhook ignora essas mensagens. A solução é detectar `fromMe` e salvá-las como mensagens do tipo `"atendente"`.

## Alterações

### 1. Webhook `zapi-webhook/index.ts`

Após a detecção de tipo de mensagem (linha ~85), adicionar tratamento para `fromMe`:

- Se `payload.fromMe === true` e há conteúdo:
  - Buscar contato pelo telefone de destino (`payload.phone`)
  - Buscar/criar conversa aberta para esse contato
  - Inserir mensagem com `remetente: "atendente"` (mensagem enviada pelo número)
  - Atualizar `ultimo_texto` e `ultima_msg_at` da conversa
  - **Pular** o AI auto-responder (não responder a mensagens próprias)

A lógica atual que processa mensagens recebidas será condicionada a `!payload.fromMe`.

### 2. Deduplicação

Para evitar duplicatas (mensagens enviadas pelo sistema que já foram salvas), adicionar verificação:
- Salvar `messageId` do Z-API (`payload.messageId`) na coluna `metadata` da mensagem
- Antes de inserir, verificar se já existe mensagem com esse `messageId` para a mesma conversa
- Se já existir, ignorar (mensagem já foi registrada pelo sistema ao enviar)

### 3. Migration — Índice para deduplicação

Criar índice GIN/BTREE em `mensagens.metadata` para busca eficiente por `messageId`:
```sql
CREATE INDEX idx_mensagens_message_id ON mensagens ((metadata->>'messageId'));
```

## Arquivos alterados

| Arquivo | Tipo |
|---------|------|
| Migration (índice metadata) | Novo |
| `supabase/functions/zapi-webhook/index.ts` | Alterado (tratamento fromMe + deduplicação) |

## Detalhes Técnicos

- Z-API envia `fromMe: true` no payload quando a mensagem é do próprio número
- O `messageId` do Z-API é único por mensagem e serve como chave de deduplicação
- Mensagens enviadas pelo sistema (via `zapi-proxy`) já são salvas no banco pelo `Conversas.tsx`, então a deduplicação evita duplicatas
- Nenhuma alteração no frontend — as mensagens aparecerão automaticamente via realtime já configurado

