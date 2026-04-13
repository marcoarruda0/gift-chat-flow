

# Integrar notificações do Peça Rara no módulo Conversas

## Problema
Quando o módulo Peça Rara envia uma mensagem via Z-API, ele só registra em `pinoquio_notificacoes`. Não cria nenhum registro nas tabelas `conversas` nem `mensagens`, que são as tabelas que o módulo Conversas lê. Por isso as mensagens enviadas não aparecem lá.

## Solução
Após cada envio bem-sucedido via Z-API no `processTenant`, criar/atualizar registros em `conversas` e `mensagens`.

## Alterações

### 1. Edge Function `pinoquio-sync/index.ts`

Adicionar uma função auxiliar `registerInConversas` que, após envio com sucesso:

1. **Busca ou cria o contato** na tabela `contatos` usando o telefone do fornecedor (e nome)
2. **Busca ou cria a conversa** na tabela `conversas` vinculada ao contato
3. **Insere a mensagem** na tabela `mensagens` com:
   - `remetente: 'atendente'` (é uma mensagem enviada pelo sistema)
   - `tipo: 'texto'`
   - `conteudo`: o texto da mensagem enviada
   - `metadata`: `{ origem: 'pinoquio', cadastramento_id: cad.id }`
4. **Atualiza a conversa** com `ultimo_texto` e `ultima_msg_at`

Lógica de busca do contato:
```
SELECT id FROM contatos 
WHERE tenant_id = ? AND telefone = ?
LIMIT 1
```
Se não existir, cria com nome do fornecedor e telefone.

Lógica de busca da conversa:
```
SELECT id FROM conversas
WHERE tenant_id = ? AND contato_id = ?
AND status != 'fechada'
LIMIT 1
```
Se não existir, cria nova conversa aberta.

### 2. Chamada no fluxo existente

No loop de `processTenant`, após `sendViaZapi` retornar `ok: true`, chamar `registerInConversas(serviceClient, tenantId, phone, cad.fornecedor_name, message, cad.id)`.

## Arquivo afetado
- `supabase/functions/pinoquio-sync/index.ts`

## Sem migration necessária
Todas as tabelas já existem com as colunas necessárias. O service client bypassa RLS.

