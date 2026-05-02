## Migração para AbacatePay API v2

### Por que está mudando

A v1 está exigindo `customer` no `/billing/create` para o seu tenant ("Customer not found"). A v2 (Checkout) **não exige nenhum dado do pagador** — o cliente preenche os próprios dados na página de pagamento hospedada da AbacatePay.

### Como vai funcionar

1. Você gera nova chave **v2** no painel da AbacatePay e cola na tela de Configurações.
2. Quando você clica em "Gerar link" para um item:
   - o backend **cria um produto na AbacatePay** correspondente àquele item (nome + preço)
   - depois cria um **checkout v2** referenciando esse produto
   - retorna a `url` do checkout para você
3. Quando o pagamento for concluído, a AbacatePay dispara o webhook `checkout.completed` com `payerInformation`, e nós atualizamos o item certo do tenant certo.

```text
Item editável (R$, descrição)
        │
        ▼
POST /v2/products/create   →  prod_xxx  (salvo no item)
        │
        ▼
POST /v2/checkouts/create  →  bill_yyy + url
        │
        ▼
Cliente paga na AbacatePay
        │
        ▼
Webhook checkout.completed → status PAID + dados do pagador
```

### Mudanças no banco

Adicionar 2 colunas em `chamado_denis_itens` para guardar a referência do produto na AbacatePay:

- `abacate_product_id text null` — id do produto na AbacatePay (`prod_xxx`)
- `abacate_product_external_id text null` — externalId enviado (mantém rastreio mesmo se o produto for recriado)

Mudar `vendas_online_config`:

- adicionar `api_version int default 2` — para registrar/saber a versão atual da chave (informativo)

Os campos `pagador_*`, `abacate_billing_id`, `abacate_status`, `abacate_url` continuam sendo usados — o webhook v2 popula tudo isso.

### Edge functions

#### `vendas-online-criar-link` (reescrita para v2)

1. Carrega item + chave do tenant.
2. Se item já tem `abacate_product_id`:
   - faz `PATCH /v2/products/{id}` para atualizar nome/preço (caso o usuário tenha editado)
   - se a AbacatePay não suportar update, recria produto e atualiza o id no item
3. Se não tem ainda:
   - `POST /v2/products/create` com `externalId = item.id`, `name`, `price` (centavos), `currency: "BRL"`
   - salva `id` retornado em `abacate_product_id`
4. `POST /v2/checkouts/create` com:
   ```json
   {
     "items": [{ "id": "<abacate_product_id>", "quantity": 1 }],
     "methods": ["PIX"],
     "externalId": "<item.id>",
     "metadata": { "tenantId": "<tenant_id>", "itemId": "<item.id>" },
     "returnUrl": "...",
     "completionUrl": "..."
   }
   ```
5. Salva `abacate_billing_id`, `abacate_url`, `abacate_status` no item.
6. Mantém o diagnóstico estruturado em PT-BR (httpStatus, errorPayload, etc.).

#### `vendas-online-webhook` (reescrita para o formato v2)

Novo payload v2:
```json
{
  "event": "checkout.completed",
  "data": {
    "checkout": { "id", "externalId", "status", "metadata" },
    "customer": { "name", "email", "taxId" },
    "payerInformation": { "method", "PIX|CARD|BOLETO": {...} }
  }
}
```

Lógica:
1. Mantém o secret na URL (`webhookSecret=<tenantId>:<secret>`) para autenticação.
2. Lê `data.checkout.metadata.tenantId` e valida contra o tenant da URL.
3. Localiza o item por:
   - `metadata.itemId` + `tenant_id` (preferencial)
   - fallback: `data.checkout.externalId` + `tenant_id`
   - fallback: `abacate_billing_id`
4. Mapeia eventos:
   - `checkout.completed` → `status=vendido`, `abacate_status=PAID`, `pago_em=now`
   - `checkout.refunded` → `abacate_status=REFUNDED`, `status=disponivel`
   - `checkout.disputed` → `abacate_status=DISPUTED`
5. Preenche `pagador_nome`, `pagador_email`, `pagador_tax_id` a partir de `data.customer`. Para `pagador_cel`, lê `data.customer.cellphone` se vier (a v2 documenta name/email/taxId mas pode vir mais).
6. Mantém dedup por `billing_id + event` na tabela `vendas_online_webhook_log`.

#### `vendas-online-testar-chave` (ajuste para v2)

Trocar o endpoint de teste para algo leve da v2 (ex.: `GET /v2/products` paginado com `limit=1` ou `GET /v2/checkouts` se existir). Mantém retorno PT-BR estruturado (`ok`, `message`, `mode`, `httpStatus`, `errorPayload`).

A `mode` (`dev`/`live`) continua sendo inferida pelo prefixo da chave.

### UI

#### `VendasOnlineConfig.tsx`

- Atualizar o texto explicativo do card AbacatePay para indicar **API v2** e o link para gerar a chave.
- Mostrar selo "API v2" no card.
- Botão "Testar conexão" continua igual.

#### `ChamadoDenis.tsx`

- Não precisa mais coletar dados do pagador.
- Continua só validando: `valor > 0`.
- Mensagens de erro continuam estruturadas (mensagem + httpStatus + payload).

### Resumo dos arquivos

Editar:
- `supabase/functions/vendas-online-criar-link/index.ts`
- `supabase/functions/vendas-online-webhook/index.ts`
- `supabase/functions/vendas-online-testar-chave/index.ts`
- `src/pages/VendasOnlineConfig.tsx`
- `src/pages/ChamadoDenis.tsx` (pequenos ajustes de mensagem/UI)

Migration:
- `chamado_denis_itens`: adicionar `abacate_product_id`, `abacate_product_external_id`
- `vendas_online_config`: adicionar `api_version int default 2`

### Resultado esperado

```text
Cole chave v2 → Testar conexão (verde)
→ Criar item, valor R$ X
→ Gerar link → cria produto + checkout v2
→ Cliente paga sem preencher nada do seu lado
→ Webhook v2 marca como pago e preenche dados do pagador
```

Nenhum dado de cliente exigido do seu lado. Se aprovar, eu implemento.