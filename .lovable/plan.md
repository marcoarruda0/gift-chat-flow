## Diagnóstico

Vendo os logs do `zapi-proxy`, **as 3 chamadas voltaram HTTP 200** — ou seja, a Z-API aceitou todas. O problema é só na **nossa lógica de detecção de sucesso** no front:

```ts
const ok = r.status === "fulfilled" && (r.value?.value || r.value?.webhook || r.value?.success || !r.value?.error);
```

A resposta do `update-webhook-message-send` provavelmente vem em outro formato (ex.: `{ updated: true }` ou body vazio `{}`), então caímos no `else` e marcamos como falha — apesar do webhook ter sido registrado de fato.

Além disso, descobri na doc da Z-API que existe um endpoint **muito melhor**: **`update-every-webhooks`** ([doc oficial](https://developer.z-api.io/webhooks/update-every-webhooks)) — uma única chamada `PUT` que registra **todos** os webhooks (recebida, enviada por mim, status de entrega, presença, conexão, etc.) para a mesma URL. Resolve o problema de raiz.

## Plano de correção

### 1. `src/pages/ZapiConfig.tsx` — usar `update-every-webhooks`

Substituir as 3 chamadas separadas por **uma única**:

```ts
const result = await callProxy("update-every-webhooks", "PUT", { value: webhookUrl });
```

Lógica nova:
- Considerar sucesso se a resposta **não tiver `error`** (status 200 do proxy + payload sem campo de erro).
- Manter fallback: se `update-every-webhooks` falhar, tentar individualmente os 3 endpoints como hoje, mas com **detecção de sucesso baseada em status HTTP** (não no shape do JSON).
- Persistir `webhook_url` no banco assim que `update-every-webhooks` der OK.
- Toast: `"✅ Todos os webhooks configurados (recebidas, enviadas e entregas)"`.

### 2. `supabase/functions/zapi-proxy/index.ts` — devolver status HTTP real

Hoje o proxy devolve só o JSON da Z-API. Vou incluir o status HTTP no payload retornado para o front conseguir distinguir 200 de 4xx mesmo quando o body for vazio:

```ts
return new Response(
  JSON.stringify({ _httpStatus: zapiResponse.status, ...responseData }),
  { status: zapiResponse.status, ... }
);
```

Isso permite que o front faça `result._httpStatus >= 200 && result._httpStatus < 300` como critério confiável de sucesso, em vez de adivinhar pelo shape do JSON.

### 3. Validação após deploy

1. Você clica em "Configurar Webhook" novamente.
2. Toast esperado: ✅ Todos os webhooks configurados.
3. Manda outra mensagem do celular para o Felipe (algo como "teste depois do fix").
4. Confirmo nos logs do `zapi-webhook` que chegou um evento com `fromMe:true` e que ele entrou na conversa com `remetente=atendente`.

## Arquivos afetados
- `src/pages/ZapiConfig.tsx` (refatorar `handleSetWebhook`)
- `supabase/functions/zapi-proxy/index.ts` (incluir `_httpStatus` na resposta)

## O que **não** muda
- A mensagem "virou cobaia haha" continua perdida — Z-API não guarda eventos de webhooks não registrados na época do envio.
- A lógica de dedup do `zapi-webhook` (que casa mensagens echoadas com as enviadas pela UI) continua válida e já está deployada.