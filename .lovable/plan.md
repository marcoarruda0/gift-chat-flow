

# Proteção contra Duplicatas na Importação de Conversas

## Problema
Se o usuário importar o mesmo arquivo `.txt` duas vezes, todas as mensagens são inseridas novamente, gerando duplicatas.

## Solução
Antes de inserir cada chunk de mensagens, buscar mensagens já existentes na conversa com `metadata->importado = true` e comparar por `created_at` + `conteudo`. Filtrar as duplicatas antes do insert.

## Mudança

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/importar-conversas/index.ts` | Buscar mensagens existentes da conversa, filtrar duplicatas antes do batch insert, retornar contagem de ignoradas |

### Lógica

1. Após encontrar/criar a conversa, buscar todas as mensagens existentes dessa conversa que tenham `metadata->importado = true`
2. Criar um Set de chaves `timestamp|conteudo` das mensagens existentes
3. Para cada chunk, filtrar apenas mensagens cujo `timestamp|conteudo` não exista no Set
4. Inserir somente as novas
5. Retornar `total_mensagens` (inseridas) e `total_duplicadas` (ignoradas) no response

### Detalhes
- A query de mensagens existentes usa `conversa_id` e filtra por `metadata->importado`
- Como pode haver mais de 1000 mensagens existentes, paginar a busca com `range()`
- O Set de dedup usa `created_at + conteudo` como chave composta

