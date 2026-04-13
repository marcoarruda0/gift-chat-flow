

# Unificar Conversas por Contato

## Problema Identificado

Dois bugs na função `findOrCreateConversa` do webhook:

1. **Conversas duplicadas após fechamento**: A função só busca conversas com `status = "aberta"`. Quando uma conversa é fechada e o contato manda nova mensagem, cria uma nova conversa em vez de reabrir a existente.
2. **Race condition**: Duas mensagens chegando quase simultaneamente (caso Jeane, 172ms de diferença) criam duas conversas abertas para o mesmo contato.

## Solução

### 1. Corrigir `findOrCreateConversa` no webhook (`zapi-webhook/index.ts`)

Mudar a lógica para:
- Buscar **qualquer conversa** do contato (não filtrar por status), ordenar por `created_at DESC`
- Se encontrar uma conversa **fechada**, reabrir ela (update status para "aberta", zerar `nao_lidas`)
- Se não encontrar nenhuma, criar nova
- Isso garante 1 conversa por contato (ou ao menos reutiliza a existente)

### 2. Limpar dados duplicados (migration SQL)

- Mesclar as conversas duplicadas de Jeane: mover mensagens para a conversa mais antiga, deletar a duplicada
- Mesclar as conversas de Marco Arruda: mover todas as mensagens para uma única conversa, deletar as extras
- Script genérico: para cada contato com múltiplas conversas, consolidar em uma só

### 3. Adicionar constraint único (migration SQL)

- Criar uma função de consolidação que roda uma vez
- Não adicionar UNIQUE constraint porque pode haver cenários legítimos de múltiplas conversas no futuro — mas a lógica do webhook vai sempre reutilizar

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `zapi-webhook/index.ts` | Alterar `findOrCreateConversa` para buscar qualquer conversa do contato e reabrir se fechada |
| Migration SQL | Consolidar conversas duplicadas existentes |

