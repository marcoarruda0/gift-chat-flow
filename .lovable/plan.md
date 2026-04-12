

# Correção: Autenticação Pinóquio (sem Bearer, com store-id)

## Problema
A API do Pinóquio não usa `Bearer` token. Os headers corretos são:
- `authorization: <TOKEN_BASE64>` (sem prefixo Bearer)
- `store-id: 32` (obrigatório, varia por loja)
- `accept: application/json`

## Alterações

### 1. Migration — adicionar coluna `store_id` em `pinoquio_config`
```sql
ALTER TABLE pinoquio_config ADD COLUMN store_id text NOT NULL DEFAULT '32';
```

### 2. Edge Function `pinoquio-sync/index.ts`
- Remover toda a lógica de `cleanJwt` e `validateJwtFormat` (não é JWT, é token base64 simples)
- Alterar headers de fetch para:
  ```ts
  headers: {
    "accept": "application/json",
    "authorization": token,
    "content-type": "application/json",
    "store-id": storeId
  }
  ```
- Passar `store_id` junto com `jwt_token` em todas as chamadas (`fetchAllPages`, `test_connection`)
- Aceitar `store_id` inline no body do `test_connection`

### 3. Frontend `src/pages/PecaRara.tsx`
- Adicionar campo `store_id` no state do `ConfigTab` (default `"32"`)
- Adicionar input "Store ID" na tela de configuração com descrição explicativa
- Enviar `store_id` no `testConnection`

## Arquivos

| Arquivo | Alteração |
|---------|-----------|
| Migration SQL | Adicionar coluna `store_id` |
| `supabase/functions/pinoquio-sync/index.ts` | Corrigir headers, remover lógica Bearer/JWT |
| `src/pages/PecaRara.tsx` | Adicionar campo Store ID na configuração |

