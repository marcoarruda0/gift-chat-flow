

# Fix: Sincronização WhatsApp — Endpoint errado + Paginação de chats

## Problemas identificados

### 1. Endpoint de mensagens errado (causa principal dos NOT_FOUND)
O código usa `load-messages-chat-phone/{phone}` — este endpoint **não existe** no Z-API. O correto é `chat-messages/{phone}`.

Todos os logs de console mostram `NOT_FOUND` com mensagem "Unable to find matching target resource method" porque a rota simplesmente não existe.

### 2. Chats limitados a ~10 (falta paginação)
A API `GET /chats` do Z-API suporta paginação via query params `page` e `pageSize`. Sem eles, retorna apenas a primeira página (default pequeno). O código precisa paginar para buscar todos os chats.

### 3. Z-API proxy não suporta query params
O `zapi-proxy` monta a URL como `.../{endpoint}` fixo. Para passar `page` e `pageSize`, precisa suportar query params na URL.

## Mudanças

### `src/components/conversas/SincronizarWhatsappDialog.tsx`

**A. Corrigir endpoint de mensagens:**
```typescript
// ANTES
`load-messages-chat-phone/${phone}`

// DEPOIS
`chat-messages/${phone}`
```

**B. Paginar busca de chats:**
Em vez de uma única chamada `chats`, fazer loop com `page=1,2,3...` e `pageSize=100` até receber array vazio ou menor que `pageSize`.

**C. Passar query params no endpoint string:**
```typescript
// Chats com paginação
`chats?page=${page}&pageSize=100`
```

### `supabase/functions/zapi-proxy/index.ts`

**Suportar query params no endpoint:**
O endpoint já é concatenado diretamente na URL, então query params como `chats?page=1&pageSize=100` já funcionam — nenhuma mudança necessária no proxy.

### Mensagens em batch (otimização)
Atualmente insere mensagens uma a uma (N+1 queries). Agrupar em batches de 50-100 para reduzir tempo de sync.

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/components/conversas/SincronizarWhatsappDialog.tsx` | Corrigir endpoint `chat-messages/{phone}`, paginar chats com `page`/`pageSize`, batch insert mensagens |

## Resultado esperado

- Todos os chats são buscados (não só 10)
- Mensagens de cada chat são recuperadas corretamente (sem NOT_FOUND)
- Novas mensagens enviadas do celular aparecem na próxima sincronização

