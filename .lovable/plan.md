# Diagnóstico — por que "virou cobaia haha" não apareceu

Olhei o banco e os logs do `zapi-webhook` agora há pouco:

- **Conversa do Felipe (`555198858566`)** existe (`ed705ba3-...`) e a última mensagem registrada é a sua resposta de **01:56 enviada pela UI do sistema** ("Nossa, total! A burocracia trava muito..."). Nada depois disso.
- **Logs do webhook após você reconfigurar (01:58)**: chegou apenas **1 evento** — uma mensagem **recebida** de um grupo da Vanessa (`fromMe:false`). Nenhum evento com `fromMe:true` chegou.
- **Config Z-API**: instância `3F174F6075A7F1A816049ED390C0144C` está conectada, `webhook_url` está salvo corretamente apontando pro `zapi-webhook`.

Conclusão: **o webhook de mensagens enviadas pelo celular nunca foi registrado na Z-API**, então a Z-API não está mandando essas mensagens pra gente — por isso "virou cobaia haha" não chegou.

## A causa do bug

Na entrega anterior eu **disse** que o botão "Configurar Webhook" passaria a registrar também o endpoint `update-webhook-message-send`, mas no código real (`src/pages/ZapiConfig.tsx`, linha 159) a função `handleSetWebhook` **continua chamando apenas `update-webhook-received`**:

```ts
const result = await callProxy("update-webhook-received", "PUT", { value: webhookUrl });
// FALTOU: chamada para "update-webhook-message-send"
```

Foi alteração documentada que não foi aplicada no código. Quando você clicou em "Configurar Webhook" novamente, só re-registrou o endpoint de mensagens **recebidas**.

# Plano de correção

## 1. `src/pages/ZapiConfig.tsx` — registrar os 3 endpoints relevantes

Refatorar `handleSetWebhook` para chamar em sequência os três endpoints da Z-API que apontam pro mesmo `zapi-webhook`:

| Endpoint Z-API | O que captura |
|---|---|
| `update-webhook-received` | Mensagens **recebidas** (clientes te mandando) |
| `update-webhook-message-send` | Mensagens **enviadas pelo seu celular / WhatsApp Web** ← faltando |
| `update-webhook-delivery` *(opcional, recomendado)* | Confirmação de entrega/leitura, melhora os ticks |

Lógica:
- Disparar as três chamadas (Promise.allSettled para não falhar tudo se uma der erro).
- Mostrar toast com resumo: `"3/3 webhooks configurados"` ou `"2/3 — falha em: message-send"`.
- Persistir `webhook_url` no banco apenas se pelo menos `received` e `message-send` tiverem sucesso.
- Se a Z-API exigir formato diferente (ex.: `enabled: true` no payload), fazer fallback testando alternativas.

## 2. `supabase/functions/zapi-webhook/index.ts` — só uma melhoria de log

Acrescentar log explícito quando chegar evento `fromMe:true` para facilitar debug futuro:
```ts
if (payload.fromMe) console.log(`📤 Outbound webhook: phone=${phone} content="${messageText?.slice(0,40)}"`);
```
A lógica de dedup secundária (já implementada na entrega anterior) continua válida — ela vai casar a mensagem ecoada com a que você digitar no celular.

## 3. Validação após deploy

Depois de aplicar:
1. Você clica em "Configurar Webhook" mais uma vez (agora vai registrar os 3).
2. Manda outra mensagem do celular para qualquer contato.
3. Eu verifico os logs e o banco para confirmar que a mensagem entrou com `remetente=atendente`.

## Sobre a "virou cobaia haha"
Mensagens enviadas **antes** do webhook `message-send` estar registrado **não podem ser recuperadas** — a Z-API não guarda histórico de eventos não entregues. A partir do fix, todas as próximas serão capturadas.

## Arquivos afetados
- `src/pages/ZapiConfig.tsx` (refatorar `handleSetWebhook`)
- `supabase/functions/zapi-webhook/index.ts` (log adicional, deploy)