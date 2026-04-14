

# Fix: 1 Conversa por Contato — Mesclar Duplicadas e Bloquear Novas

## Problema raiz

Há **3 locais** no código que criam conversas filtrando apenas por `status = "aberta"`. Se a conversa foi fechada (por fluxo, manualmente, etc.), esses locais criam uma NOVA conversa em vez de reabrir a existente. O webhook e o sync já foram corrigidos, mas faltam dois pontos no frontend.

Dados atuais: 6 contatos com conversas duplicadas (um contato tem 6 conversas).

## Solução em 3 partes

### 1. Corrigir criação de conversas no frontend (2 arquivos)

**`src/pages/Conversas.tsx` — `criarConversa`** (linha 196-202):
Remover `.eq("status", "aberta")`. Buscar a conversa mais recente do contato (qualquer status). Se encontrar fechada, reabrir.

**`src/pages/Contatos.tsx` — `startConversa`** (linha 154-161):
Mesma correção: remover filtro de status, buscar mais recente, reabrir se fechada.

### 2. Mesclar conversas duplicadas existentes (migration SQL)

Script SQL que para cada contato com múltiplas conversas:
1. Identifica a conversa mais recente (a "principal")
2. Move todas as mensagens das conversas duplicadas para a principal (`UPDATE mensagens SET conversa_id = ...`)
3. Move registros de `fluxo_sessoes` e `conversa_transferencias`
4. Deleta as conversas duplicadas
5. Atualiza `ultimo_texto` e `ultima_msg_at` da conversa principal

### 3. Adicionar constraint única no banco (migration SQL)

```sql
CREATE UNIQUE INDEX conversas_tenant_contato_unique 
ON conversas(tenant_id, contato_id);
```

Isso impede que o banco aceite duas conversas para o mesmo contato no mesmo tenant, servindo como proteção final.

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Conversas.tsx` | `criarConversa`: buscar qualquer status, reabrir se fechada |
| `src/pages/Contatos.tsx` | `startConversa`: buscar qualquer status, reabrir se fechada |
| Migration SQL | Mesclar duplicadas existentes + unique index |

## Resultado esperado

Cada contato terá exatamente 1 conversa. Todas as mensagens estarão consolidadas. O banco rejeita duplicatas futuras.

