

# Corrigir Duplicatas na Importação de Conversas

## Problema

A proteção contra duplicatas não funciona porque os timestamps são comparados como strings, mas o formato difere:
- **No banco (UTC):** `2025-09-08 18:43:00+00`
- **Na importação (BRT):** `2025-09-08T15:43:00-03:00`

Ambos representam o mesmo momento, mas a comparação de strings falha. Resultado: 394 mensagens quando deveria ter ~131.

## Solução (2 partes)

### 1. Limpar duplicatas existentes

Criar um script SQL via migration que mantém apenas a mensagem mais antiga (menor `id`) para cada grupo `(conversa_id, created_at, conteudo)` onde `metadata->>'importado' = 'true'`.

```sql
DELETE FROM mensagens
WHERE id NOT IN (
  SELECT MIN(id) FROM mensagens
  WHERE metadata->>'importado' = 'true'
  GROUP BY conversa_id, created_at, conteudo
)
AND metadata->>'importado' = 'true';
```

### 2. Corrigir a comparação de timestamps na Edge Function

No `importar-conversas/index.ts`, converter os timestamps existentes para ISO antes de montar o Set de dedup, usando `new Date(m.created_at).toISOString()` para normalizar ambos os lados da comparação.

```typescript
// Ao montar o Set de existentes:
existingKeys.add(`${new Date(m.created_at).toISOString()}|${m.conteudo}`);

// Ao filtrar novos:
const key = `${new Date(row.created_at).toISOString()}|${row.conteudo}`;
```

### Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/importar-conversas/index.ts` | Normalizar timestamps com `new Date().toISOString()` na dedup |
| Migration SQL | DELETE para remover duplicatas existentes (~263 registros) |

