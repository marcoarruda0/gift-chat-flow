

# Fix: Conversas duplicadas + Timestamp da sincronização

## Problemas identificados

### 1. Conversas duplicadas (mesma pessoa = múltiplas conversas)

**Sync dialog (linha 122-128):** busca conversa com `.eq("status", "aberta")`. Se a conversa foi fechada (pelo nó `gerenciar_conversa` ou manualmente), a sync cria uma NOVA conversa em vez de reabrir a existente.

**Webhook:** já corrigido — `findOrCreateConversa` busca ANY conversa (independente de status) e reabre se necessário.

**Fix:** Replicar a lógica do webhook no sync dialog — buscar a conversa mais recente do contato independente do status, e reabrir se fechada.

### 2. Timestamp errado nas mensagens sincronizadas

O código da sync (linha 197-199) já tenta usar `msg.timestamp`, mas o campo pode não existir em todas as mensagens retornadas pela Z-API. Quando `msg.timestamp` é `undefined` ou `0`, cai no fallback `new Date().toISOString()` (timestamp atual).

Além disso, há um problema de **metadados inconsistentes**: o sync salva `zapi_message_id` e o webhook salva `messageId` — isso impede a deduplicação cruzada (mensagens podem aparecer duplicadas).

**Fix:** 
- Normalizar o campo de metadata para usar `messageId` em ambos (sync e webhook)
- Garantir que o timestamp original da mensagem é usado, logando warning quando não existir

## Mudanças

### `SincronizarWhatsappDialog.tsx`

**A. Busca de conversa sem filtro de status:**
```typescript
// ANTES
.eq("status", "aberta")

// DEPOIS: buscar a mais recente, qualquer status
.order("created_at", { ascending: false })
.limit(1)
// Se encontrou fechada → reabrir
```

**B. Normalizar metadata key para `messageId`:**
```typescript
metadata: {
  messageId: zapiId,  // era zapi_message_id
  senderName: ...,
}
```

**C. Dedup query atualizada:**
```typescript
// ANTES
.contains("metadata", { zapi_message_id: zapiId })

// DEPOIS
.eq("metadata->>messageId", zapiId)
```

**D. Timestamp mais robusto:**
- Tentar `msg.timestamp`, `msg.momment` (campo alternativo da Z-API), `msg.messageTimestamp`
- Logar warning se nenhum timestamp original for encontrado

## Arquivo afetado

| Arquivo | Mudança |
|---------|---------|
| `src/components/conversas/SincronizarWhatsappDialog.tsx` | Busca conversa sem filtro status; normalizar metadata; timestamp robusto |

