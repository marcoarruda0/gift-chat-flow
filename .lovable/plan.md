## Problema

A AbacatePay rejeitou o payload com `"methods": ["PIX", "CREDIT_CARD"]` retornando HTTP 422 com a mensagem `Expected kind 'UnionEnum'`. O valor `"CREDIT_CARD"` não pertence ao enum aceito pela API v2 — o nome correto do método de cartão na AbacatePay é `"CARD"`.

## Mudança

Em `supabase/functions/vendas-online-criar-link/index.ts`, linha 147, alterar:

```ts
methods: ["PIX", "CREDIT_CARD"],
```

para:

```ts
methods: ["PIX", "CARD"],
```

A função é redeployada automaticamente.

## Validação

- Gerar novo link em Vendas Online → não deve mais retornar 422.
- Checkout AbacatePay deve oferecer PIX e Cartão.
- Se ainda houver 422, o valor correto pode ser `"CREDIT"` — testar como fallback.
