# Plano: Botão "Testar Webhook" em Vendas Online

## Objetivo

Permitir que você valide, antes de ativar produção, se:
1. A URL do webhook está acessível.
2. O `webhookSecret` está correto (não retorna 403).
3. Os eventos `billing.paid` e `billing.refunded` são processados sem erro.
4. O log aparece em `vendas_online_webhook_log` corretamente.

Tudo isso sem precisar fazer um pagamento real ou configurar nada na AbacatePay.

## Como vai funcionar (UX)

Em **Configuração Vendas Online → card "Webhook (obrigatório)"**, abaixo da URL copiável, adicionar uma seção **"Testar webhook"**:

- Dois botões lado a lado:
  - **"Simular billing.paid"**
  - **"Simular billing.refunded"**
- Ao clicar, o sistema dispara internamente um POST para a própria URL do webhook com um payload v2 sintético, marcado como teste (`metadata.test = true`).
- Resultado exibido em um painel inline, com:
  - Status HTTP retornado.
  - Corpo da resposta (JSON formatado).
  - Indicador visual: verde (200 ok), amarelo (200 com warning ex. `item_not_found`), vermelho (>=400).
  - Link "Ver logs do webhook" que faz refresh consultando `vendas_online_webhook_log` e mostra a última linha registrada (event, processado, erro).
- Aviso explicando que o teste **não altera nenhum item real** — usa um `itemId` falso, então o webhook responde com `warning: "item_not_found"` (esperado e indica que tudo funcionou até a etapa de localização do item).

## Mudanças técnicas

### 1. Nova edge function `vendas-online-testar-webhook`
- Autenticada (verifica JWT do usuário e pega `tenant_id` do profile).
- Recebe `{ event: "billing.paid" | "billing.refunded" }`.
- Lê `webhook_secret` do `vendas_online_config` do tenant.
- Monta a URL `https://{PROJECT}.supabase.co/functions/v1/vendas-online-webhook?webhookSecret={tenant}:{secret}`.
- Monta payload v2 sintético:
  ```json
  {
    "event": "billing.paid",
    "apiVersion": 2,
    "data": {
      "billing": {
        "id": "bill_test_<uuid>",
        "status": "PAID",
        "metadata": { "tenantId": "...", "itemId": "test-<uuid>", "test": true }
      },
      "customer": { "name": "Teste Webhook", "email": "teste@exemplo.com", "taxId": "00000000000" }
    }
  }
  ```
- Faz `fetch` POST e retorna `{ httpStatus, responseBody, webhookUrl, sentPayload }`.
- Para `billing.refunded`, troca `event` e `status` para `REFUNDED`.

Vantagem de chamar via HTTP (e não invocar a função interna): valida de verdade que a URL pública está exposta e que o `webhookSecret` confere — exatamente o que a AbacatePay vai fazer.

### 2. Pequeno ajuste no `vendas-online-webhook`
- Reconhecer `metadata.test === true` e:
  - Pular a tentativa de localizar item (retornar `{ ok: true, test: true }`).
  - Ainda assim gravar uma linha em `vendas_online_webhook_log` com `event` e `payload` para você confirmar que chegou.
- Isso garante que o teste exercita parsing + auth + log, sem poluir dados.

### 3. UI em `VendasOnlineConfig.tsx`
- Nova subseção dentro do card de Webhook, abaixo da caixa amarela de instruções:
  - Título: "Testar webhook"
  - Texto curto: "Dispara um evento de teste para confirmar que a URL está respondendo. Não altera nenhuma venda."
  - 2 botões com loading individual.
  - Painel de resultado (mesmo estilo visual do "Testar conexão" que já existe).
  - Botão secundário "Ver últimos logs" → consulta `vendas_online_webhook_log` (últimos 5 do tenant) e mostra em uma lista compacta (timestamp, event, processado, erro).
- Desabilitar os botões se `apiKey`, `secret` ou config não estiverem salvos (mostrando hint "Salve a configuração antes de testar").

## Arquivos

- **criar** `supabase/functions/vendas-online-testar-webhook/index.ts`
- **editar** `supabase/functions/vendas-online-webhook/index.ts` (suporte a `metadata.test`)
- **editar** `src/pages/VendasOnlineConfig.tsx` (UI de teste + visualizador de logs)

Sem migrations.

## Observações

- O webhook real continua exigindo cadastro manual no painel AbacatePay — esse botão **não substitui** isso, apenas verifica que sua infra está pronta para receber.
- O log de teste fica gravado com o evento real (`billing.paid`/`billing.refunded`); se quiser, posso filtrar testes na visualização (`payload->>data->>billing->>metadata->>test`).
