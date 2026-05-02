# Diagnóstico

O item #7 está PAGO na AbacatePay (`bill_eS22SXuY31ZaxjYReDPzY2aN`) mas continua **PENDING** no nosso banco. Conferi:

- `vendas_online_webhook_log` está **vazio** — nenhuma requisição chegou.
- Logs da função `vendas-online-webhook` mostram só boot/shutdown, sem POST.
- Os metadados (`tenantId`, `itemId`) estão corretos no painel da AbacatePay.

**Causa raiz:** a v2 da AbacatePay **não aceita** `webhookUrl` no payload do checkout. O webhook precisa estar **cadastrado no painel** da AbacatePay (Configurações → Webhooks), apontando para a nossa URL pública com o `?webhookSecret=tenantId:secret`. Sem esse cadastro, eles nunca nos notificam.

# Plano

## 1. Botão "Sincronizar status" (resolve o item #7 agora e qualquer falha futura)

Nova edge function `vendas-online-sincronizar-status`:
- Recebe `item_id`.
- Lê `abacate_billing_id` do item.
- Chama `GET https://api.abacatepay.com/v2/billing/get?id={billing_id}` com a chave do tenant.
- Se resposta tiver `status === "PAID"`, aplica o mesmo patch do webhook: `abacate_status=PAID`, `status=vendido`, `pago_em=now()`, e salva `pagador_nome/email/tax_id/cel` se vierem em `customer`/`payerInformation`.
- Retorna o status atualizado.

Na UI `ChamadoDenis.tsx`: ao lado do botão de copiar link, adicionar um ícone "atualizar status" para itens com `abacate_status === "PENDING"` que dispara essa função e dá refresh.

## 2. Página de configuração do webhook

Em `VendasOnlineConfig.tsx`, adicionar um bloco destacado "**Configuração obrigatória do Webhook**" com:
- A URL exata pronta para copiar: `https://ywcgburxzwukjtqxuhyr.supabase.co/functions/v1/vendas-online-webhook?webhookSecret={tenantId}:{secret}`
- Botão "Copiar URL".
- Passo a passo: AbacatePay → Configurações → Webhooks → Adicionar → colar URL → marcar evento `billing.paid` (e opcionalmente `billing.cancelled`, `billing.refunded`).
- Aviso vermelho: "Sem este passo, os pagamentos não serão atualizados automaticamente — use o botão Sincronizar status manualmente."

## 3. Aceitar o evento `billing.paid` no webhook

O `vendas-online-webhook` atual já trata `checkout.completed` e o status `PAID`. Vou garantir que `billing.paid` também seja reconhecido (a v2 emite esse nome para checkouts pagos via PIX). Já está coberto pelo `evt.includes("completed") || status === "PAID"`, mas vou adicionar `evt.includes("paid")` por segurança e suportar o payload `data.billing` além de `data.checkout`.

## Arquivos

- **criar** `supabase/functions/vendas-online-sincronizar-status/index.ts`
- **editar** `supabase/functions/vendas-online-webhook/index.ts` (aceitar `billing.paid`)
- **editar** `src/pages/ChamadoDenis.tsx` (botão sincronizar)
- **editar** `src/pages/VendasOnlineConfig.tsx` (bloco de instruções + URL copiável)

Sem migrations.
