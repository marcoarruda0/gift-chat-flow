## Diagnóstico do erro atual

Logs do `vendas-online-criar-link` mostram:

```
422 "Expected property 'products.0.externalId' to be string but found: undefined"
```

Ou seja, a v1 da AbacatePay **exige** `externalId` **dentro de cada product** (string). Na correção anterior removemos esse campo junto com o `externalId` do nível raiz — precisamos devolver apenas no produto.

---

## 1. `supabase/functions/vendas-online-criar-link/index.ts`

- Voltar a enviar `externalId: item.id` **dentro de `products[0]`** (string).
- Manter sem `externalId` na raiz (v1 interpreta como `customerId`).
- Manter `metadata { externalId, tenantId }` para o webhook.
- Manter o tratamento de erro que repassa `abJson.error` ao frontend.

Payload final:

```ts
{
  frequency: "ONE_TIME",
  methods: ["PIX"],
  products: [{
    externalId: item.id,                 // exigido pela v1
    name: `Item #${item.numero}`,
    description: (item.descricao || "Venda Online").slice(0, 200),
    quantity: 1,
    price: valorCents,
  }],
  returnUrl, completionUrl,
  metadata: { externalId: item.id, tenantId },
}
```

## 2. `supabase/functions/vendas-online-webhook/index.ts`

Ajustar a localização do item para priorizar metadata, garantindo o tenant correto:

1. Ler `data.metadata.externalId` e `data.metadata.tenantId`.
2. Se `metadata.tenantId` existir e não bater com `tenantId` da URL → 403 (`tenant_mismatch`, gravado no log).
3. Procurar item por:
   a. `metadata.externalId` (id do item) + `tenant_id` da URL;
   b. fallback: `abacate_billing_id`;
   c. fallback: `products[0].externalId`.
4. Manter dedup por `billing_id+event` e atualização de status/pagador como hoje.

## 3. Nova função `vendas-online-testar-chave`

`supabase/functions/vendas-online-testar-chave/index.ts` (`verify_jwt = true` em `supabase/config.toml`).

Fluxo:
- Autentica usuário (JWT) → pega `tenant_id` do profile.
- Lê `vendas_online_config.abacate_api_key`.
- Faz `GET https://api.abacatepay.com/v1/customer/list` com `Authorization: Bearer <key>` (endpoint leve, autenticado, não cria nada).
- Retorna `{ ok: true, mode: "dev"|"live" }` baseado no prefixo `abc_dev_`/`abc_live_`, ou `{ ok: false, message }` com o erro da Abacate.

## 4. UI — `src/pages/VendasOnlineConfig.tsx`

- Adicionar botão **"Testar conexão"** no card AbacatePay.
- Ao clicar: `supabase.functions.invoke("vendas-online-testar-chave")`.
- Mostrar badge/alerta verde "Chave válida (modo dev/live)" ou vermelho com a mensagem retornada.
- Estado local de loading no botão.

## 5. `supabase/config.toml`

Adicionar:
```toml
[functions.vendas-online-testar-chave]
verify_jwt = true
```

## Arquivos

Editar: `vendas-online-criar-link/index.ts`, `vendas-online-webhook/index.ts`, `VendasOnlineConfig.tsx`, `supabase/config.toml`.
Criar: `vendas-online-testar-chave/index.ts`.
