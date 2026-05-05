## Mudança

Em `supabase/functions/vendas-online-criar-link/index.ts`, no payload do checkout (`checkoutPayload`), alterar:

```ts
methods: ["PIX"],
```

para:

```ts
methods: ["PIX", "CREDIT_CARD"],
```

Nenhuma outra alteração no fluxo. Após o ajuste, a função `vendas-online-criar-link` é redeployada automaticamente.

## Validação

- Gerar um novo link em Vendas Online → checkout da AbacatePay deve oferecer PIX e Cartão de Crédito.
- Links já gerados (que estão em cache via `abacate_url` com status PENDING) continuam como estavam — para forçar regeração com cartão, o slot precisa ser limpo/recriado.
