## Vendas Online + AbacatePay (aprovado)

**Decisões confirmadas:** chave AbacatePay por tenant + webhook secret por tenant (URL `?webhookSecret=<tenant_id>:<secret>`).

---

### 1. Rename (apenas UI, sem migração)

- `src/components/AppSidebar.tsx`: label `"Chamado Denis Online"` → `"Vendas Online"`.
- `src/pages/ChamadoDenis.tsx`: trocar título e subtítulo.
- Manter rota `/chamado-denis`, tabela `chamado_denis_itens` e nome do componente para não quebrar nada.

### 2. Migração

Adicionar em `chamado_denis_itens`:
```
abacate_billing_id   text unique
abacate_url          text
abacate_status       text          -- PENDING|PAID|EXPIRED|CANCELLED|REFUNDED
pagador_nome         text
pagador_email        text
pagador_cel          text
pagador_tax_id       text
pago_em              timestamptz
```

Nova tabela `vendas_online_config`:
```
tenant_id        uuid pk → tenants
abacate_api_key  text
dev_mode         boolean default true
webhook_secret   text
created_at, updated_at
```
RLS: SELECT/UPSERT só para `admin_tenant`/`admin_master` do próprio tenant.

Nova tabela `vendas_online_webhook_log` (auditoria/idempotência):
```
id uuid pk, tenant_id uuid, event text, billing_id text,
payload jsonb, processado bool, erro text, created_at timestamptz
```

### 3. Edge function `vendas-online-criar-link`

`POST { item_id }` → autentica JWT, busca item do tenant, lê API key de `vendas_online_config`, chama `POST https://api.abacatepay.com/v1/billing/create` com `products: [{ name: "Item #<numero>", description: item.descricao, price: round(item.valor*100), quantity: 1 }]`, sem `customerId` (cliente preenche no checkout). Salva `abacate_billing_id`, `abacate_url`, `abacate_status='PENDING'`. Idempotente: se já existe link PENDING, retorna o existente.

### 4. Edge function `vendas-online-webhook` (público, `verify_jwt = false`)

URL: `…/functions/v1/vendas-online-webhook?webhookSecret=<tenant_id>:<secret>`

1. Separa `tenant_id` e `secret` da query, compara com `vendas_online_config.webhook_secret`.
2. Valida HMAC do header `X-Webhook-Signature` com a chave pública AbacatePay.
3. Localiza item por `abacate_billing_id` (ou `data.externalId`).
4. Atualiza `abacate_status`, `pago_em`, dados do pagador (`name`, `email`, `cellphone`, `taxId`); se evento de pagamento aprovado → `status='vendido'`; se reembolso → volta para `disponivel`.
5. Loga em `vendas_online_webhook_log` (idempotente por `billing_id+event`).

### 5. UI

`src/pages/ChamadoDenis.tsx`:
- Título "Vendas Online".
- Nova coluna **Pagamento**: "Gerar link" / "Aguardando (copiar URL · abrir)" / "Pago ✓ <nome do pagador>" (tooltip com email, cel, tax_id, data).
- Realtime via `postgres_changes` na tabela para atualizar quando o webhook chegar.
- Filtro extra: pago / pendente / sem link.
- Coluna `status` vira read-only quando `abacate_status='PAID'`.

Nova página `src/pages/VendasOnlineConfig.tsx` (admin do tenant):
- Inputs: API key (mascarada), `dev_mode` toggle, webhook secret (com botão "gerar").
- Mostra a URL do webhook pronta para copiar e colar no dashboard AbacatePay.
- Botão "Testar conexão".

Rota `/vendas-online-config` em `src/App.tsx`; item no sidebar dentro de "Configurações" ou ícone de engrenagem na página de Vendas Online.

### 6. Segurança

- RLS estrita em `vendas_online_config`; API key acessível só via edge function (service role).
- Edge `criar-link` valida que o item pertence ao tenant do JWT.
- Webhook valida secret (URL) **e** HMAC (corpo).
- Idempotência em `webhook_log`.

### Arquivos

Criar:
- `supabase/migrations/<ts>_vendas_online.sql`
- `supabase/functions/vendas-online-criar-link/index.ts`
- `supabase/functions/vendas-online-webhook/index.ts`
- `src/pages/VendasOnlineConfig.tsx`

Editar:
- `src/pages/ChamadoDenis.tsx`
- `src/components/AppSidebar.tsx`
- `src/App.tsx`
