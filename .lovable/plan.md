# Diagnóstico

Confirmei o problema com dados reais:

- **Contato Felipe (555198858566)** — conversa `ed705ba3-…` no canal `zapi`. Tem 10 mensagens recentes, **todas com `remetente='contato'`**. Nenhuma resposta sua (do número conectado) ficou registrada após 26/04.
- No tenant inteiro: das 76 mensagens com `remetente='atendente'` no canal Z-API, **a última é de 15/04** e **nenhuma** tem `messageId` no metadata — ou seja, nunca veio de um webhook `fromMe`. Todas foram inseridas pela própria interface da Lovable (`zapi-proxy`).
- **Causa raiz:** o `zapi-webhook` já trata `payload.fromMe === true` corretamente (salva como `remetente='atendente'`). Mas em `src/pages/ZapiConfig.tsx` só registramos um único webhook na Z-API: `update-webhook-received` (mensagens recebidas). **Nunca registramos `update-webhook-message-send`**, que é o evento que a Z-API dispara quando você envia/responde pelo app do WhatsApp no celular ou pelo WhatsApp Web. Sem esse webhook configurado lá na Z-API, essas mensagens nunca chegam ao nosso backend.

# Plano de correção

## 1. Registrar também o webhook de mensagens enviadas (`fromMe`)

Em `src/pages/ZapiConfig.tsx`, expandir `handleSetWebhook` para chamar **dois** endpoints da Z-API com a mesma URL do nosso `zapi-webhook`:

- `update-webhook-received` (já existe) — mensagens recebidas
- `update-webhook-message-send` (NOVO) — mensagens enviadas pelo seu número (celular, Web, ou via API)

Tratar erros isoladamente para que, se um falhar, o outro ainda seja aplicado, mostrando um toast claro com o resultado de cada um.

## 2. Evitar duplicação quando a mensagem é enviada pela própria interface

Hoje o app insere a mensagem em `mensagens` **antes** de chamar a Z-API e não guarda o `messageId` retornado. Quando o webhook `fromMe` for ativado, a Z-API ecoará TODA mensagem enviada (inclusive as que saem do nosso `zapi-proxy`) → o webhook criaria uma cópia.

Solução em duas camadas:

**a) Capturar e salvar o `messageId` retornado pelo `zapi-proxy`** em `src/pages/Conversas.tsx`. As funções `callZapi("send-text"|"send-audio"|"send-image"|"send-document"|"send-video", …)` já retornam o JSON da Z-API (que inclui `messageId` ou `id`). Após cada envio bem-sucedido, fazer `update` em `mensagens.metadata.messageId` para a linha recém-inserida (mesma estratégia já usada no Cloud com `persistWaMessageId`). Aplicar nos 4 fluxos: texto, áudio, anexo (imagem/documento) e template.

**b) Reforçar a deduplicação no webhook** (`supabase/functions/zapi-webhook/index.ts`). Hoje o dedup checa só `metadata->>messageId`. Adicionar um segundo critério para o caso `fromMe` em que o `messageId` ainda não foi salvo (race condition entre o INSERT do app e a chegada do webhook): se `isFromMe` e existir mensagem do mesmo `tenant_id`+`conversa_id` com `remetente='atendente'`, mesmo `tipo` e mesmo `conteudo` (ou `conteudo` começando igual para mídias) nos últimos 60 segundos sem `messageId`, em vez de criar duplicata, **atualizar** essa linha existente preenchendo o `metadata.messageId`. Isso fecha a janela de race e ainda backfila o ID para futuros dedups.

## 3. Backfill / orientação ao usuário

- Adicionar uma nota visível no card de webhook em `ZapiConfig.tsx` explicando que agora as mensagens enviadas do celular/WhatsApp Web também serão registradas, e pedir para clicar em "Configurar Webhook" novamente para aplicar.
- Apenas mensagens **futuras** serão capturadas; o histórico anterior das respostas via celular não pode ser recuperado retroativamente (a Z-API não fornece esse histórico em massa).

## 4. Regression check

- Confirmar que mensagens enviadas pelo app continuam aparecendo uma única vez (sem duplicar com o eco `fromMe`).
- Confirmar que mensagens digitadas no celular do usuário aparecem com `remetente='atendente'` na conversa correta.
- Confirmar que dedup continua funcionando para mensagens de contato (`fromMe=false`) com mesmo `messageId`.

# Arquivos afetados

- **Modificado:** `src/pages/ZapiConfig.tsx` — registrar 2 webhooks; melhorar feedback ao usuário.
- **Modificado:** `src/pages/Conversas.tsx` — capturar e persistir `messageId` da resposta da Z-API após cada envio (texto/áudio/anexo/template).
- **Modificado:** `supabase/functions/zapi-webhook/index.ts` — dedup secundário por (conversa, conteudo, tipo, atendente, janela 60s) para casos `fromMe` sem `messageId` salvo ainda.

Sem mudanças de schema, RLS ou novos secrets.