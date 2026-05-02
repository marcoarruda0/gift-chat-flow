## Diagnóstico

O webhook real da AbacatePay chegou com `webhookSecret` na URL, mas nosso endpoint retornou `{"error":"invalid_secret"}`.

Causa: hoje a função `vendas-online-webhook` exige o formato `webhookSecret={tenantId}:{secret}`. Quando você cadastra a URL no painel da AbacatePay, é natural colar **só o secret** (a UI deles trata como um valor único, e o `:` no meio confunde). Sem o `tenantId:` na frente, o split falha → 401 `invalid_secret`.

Confirmação no payload recebido: o `metadata.tenantId` (`fcaec321-...`) e o `metadata.itemId` já vêm dentro do corpo, então **não precisamos do tenantId na URL** — podemos descobrir o tenant pelo próprio secret (que é único por tenant) e cruzar com o metadata.

## Mudanças

### 1. `vendas-online-webhook/index.ts` — aceitar 3 formatos de secret
Aceitar, em ordem:
1. `webhookSecret={tenantId}:{secret}` (formato atual, retrocompatível com testes internos)
2. `webhookSecret={secret}` apenas → buscar `vendas_online_config` por `webhook_secret = secret` e usar o `tenant_id` daí
3. Em ambos os casos, se `payload.data.billing.metadata.tenantId` estiver presente, validar que bate com o tenant resolvido (já fazemos isso, mantém)

Pseudocódigo do bloco de auth:
```ts
const raw = url.searchParams.get("webhookSecret") || "";
let tenantId: string | null = null;
let secret: string | null = null;
if (raw.includes(":")) {
  [tenantId, secret] = raw.split(":");
}
if (!secret) secret = raw;

let cfg;
if (tenantId) {
  cfg = await admin.from("vendas_online_config")
    .select("tenant_id, webhook_secret")
    .eq("tenant_id", tenantId).maybeSingle();
} else {
  cfg = await admin.from("vendas_online_config")
    .select("tenant_id, webhook_secret")
    .eq("webhook_secret", secret).maybeSingle();
  tenantId = cfg.data?.tenant_id ?? null;
}
if (!cfg.data || cfg.data.webhook_secret !== secret || !tenantId) {
  return json({ error: "forbidden" }, 403);
}
```

Logar o motivo do 401/403 em `vendas_online_webhook_log` (com `tenant_id` nulo permitido) para facilitar debug futuro.

### 2. `src/pages/VendasOnlineConfig.tsx` — simplificar a URL exibida
Trocar o template da URL recomendada para o formato simples:
```
https://{PROJECT}.supabase.co/functions/v1/vendas-online-webhook?webhookSecret={secret}
```
Sem `tenantId:` no meio. O guia passo-a-passo continua igual, só mais limpo de copiar/colar.

Manter o teste interno (`vendas-online-testar-webhook`) como está — o endpoint aceita os dois formatos, então não quebra.

### 3. Migrar configurações existentes
Adicionar índice/único em `vendas_online_config(webhook_secret)` para que a busca por secret seja confiável e não permita duplicidade entre tenants.

```sql
create unique index if not exists vendas_online_config_webhook_secret_uniq
  on public.vendas_online_config (webhook_secret)
  where webhook_secret is not null;
```

## Arquivos

- editar `supabase/functions/vendas-online-webhook/index.ts`
- editar `src/pages/VendasOnlineConfig.tsx`
- nova migration com o índice único

## Validação

1. Após deploy, cadastrar a URL nova (só `?webhookSecret={secret}`) na AbacatePay.
2. Usar **Testar webhook** (botões já existentes) — deve continuar funcionando (formato `tenantId:secret`).
3. Disparar uma cobrança real — agora `billing.paid` deve marcar o item como `vendido` e gravar o pagador.
4. Conferir em **Ver últimos logs** que o evento aparece com `processado = true`.
