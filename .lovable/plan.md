# Plano: provar se a Meta está chamando o webhook + auto-fix de assinatura

## Diagnóstico atual (confirmado agora)

- `whatsapp_cloud_config`: `phone_number_id=1057954850740861`, `display_phone=+1 (555) 166-5056`, `status=conectado`
- `ultima_verificacao_at = 2026-04-24 13:53` (GET handshake funcionou uma vez)
- `ultima_mensagem_at = NULL` (nenhum POST foi processado pelo webhook)
- `function_edge_logs` filtrando por `whatsapp-cloud-webhook`: **zero hits**
- Comparativo: `zapi-webhook` está recebendo dezenas de mensagens por minuto

Conclusão: o problema **não é o nosso código** — a Meta literalmente não está chamando o endpoint. Para diferenciar entre "Meta não está chamando" vs "Meta chama mas a infraestrutura derruba antes" preciso de log na primeira linha de cada request, e quero te dar uma forma de re-assinar `messages` automaticamente sem mexer no painel da Meta.

## O que vou fazer

### 1. `supabase/functions/whatsapp-cloud-webhook/index.ts`
Adicionar log na primeira linha do `Deno.serve`, antes de qualquer parsing:
```ts
console.log("[whatsapp-cloud-webhook] HIT", {
  method, path, search, ip, ua
});
```
Assim, qualquer request que tocar a função aparece em `edge_function_logs` independentemente do método ou do corpo. Se mesmo depois disso continuar zerado, está provado que a Meta não está chamando — não é problema nosso.

### 2. `supabase/functions/whatsapp-cloud-proxy/index.ts`
Hoje o proxy só permite `/{phone_number_id}/...`. Vou adicionar suporte explícito a chamadas no nível do WABA (`useWabaId: true` já existe) e garantir que aceita `subscribed_apps` como endpoint, para a UI poder chamar:
```
POST https://graph.facebook.com/v21.0/{waba_id}/subscribed_apps
```
Isso é o equivalente programático de "Subscribe" no painel da Meta.

### 3. `src/components/whatsapp-oficial/DiagnosticoCard.tsx`
- Quando estado for 🟡 ("Verificado, mas Meta não enviou nenhum evento"), mostrar uma **checklist visual** das 3 causas prováveis:
  1. Campo `messages` não está assinado em `Webhook fields`
  2. App está em modo Development e o número remetente não está na allowlist
  3. Webhook está apontando pra outro App / WABA
- Adicionar botão **"Re-assinar messages automaticamente"** que dispara uma função client → proxy → `POST /{waba_id}/subscribed_apps`. Mostra toast de sucesso/erro e força refresh do diagnóstico.

### 4. `src/pages/WhatsappOficialConfig.tsx`
- Implementar handler `handleSubscribeMessages()` que chama o proxy com `useWabaId: true` e endpoint `subscribed_apps`.
- Passar esse handler como prop para o `DiagnosticoCard`.

## Como vamos validar

1. Você abre `/configuracoes/whatsapp-oficial` → clica em "Re-assinar messages automaticamente"
2. Se a Meta retornar `{ success: true }`, o webhook passa a ser chamado e o card vira 🟠/🟢
3. Se a Meta retornar erro de permissão (`access_token` sem escopo `whatsapp_business_management`), o toast mostra a mensagem exata — aí saberemos que precisa gerar um novo token na Meta
4. Mando uma mensagem real do meu celular pro número oficial → conversa aparece em `/conversas` com badge "Oficial"

## Arquivos modificados

- `supabase/functions/whatsapp-cloud-webhook/index.ts` (log na primeira linha)
- `supabase/functions/whatsapp-cloud-proxy/index.ts` (já suporta `useWabaId`, mas vou garantir)
- `src/components/whatsapp-oficial/DiagnosticoCard.tsx` (checklist + botão re-assinar)
- `src/pages/WhatsappOficialConfig.tsx` (handler de re-assinatura)

## Risco

Baixo. Adições são puramente aditivas — log extra e um novo botão. Nenhuma migração de banco.