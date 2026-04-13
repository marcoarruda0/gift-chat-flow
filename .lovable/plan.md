

# Diagnóstico: Mensagens em tempo real no módulo Conversas

## Situação atual

O código **já tem** realtime configurado corretamente:
- Tabelas `mensagens` e `conversas` estão na publicação `supabase_realtime` ✓
- `Conversas.tsx` assina canais de `postgres_changes` para INSERT em `mensagens` e `*` em `conversas` ✓
- Quando uma nova mensagem chega no canal, ela é adicionada ao state e `fetchConversas()` é chamado ✓

## Problema provável

O Supabase Realtime com RLS tem uma limitação conhecida: as subscriptions que usam RLS dependem do token JWT do usuário para filtrar eventos. Em alguns cenários (token expirado, conexão WebSocket instável, ou filtro genérico sem `filter`), os eventos podem não chegar ao cliente.

A subscription atual não usa nenhum **filter** na subscrição — ela escuta TODAS as mudanças na tabela e depende do RLS para filtrar. Isso pode ser instável.

## Solução

Adicionar **filtros explícitos** nas subscriptions do Realtime e implementar um **polling de fallback** como segurança adicional:

### 1. Filtrar subscription de `mensagens` pelo `tenant_id`
No canal `mensagens-realtime`, adicionar `filter: "tenant_id=eq.{tenantId}"` para garantir que o Supabase envie apenas eventos relevantes.

### 2. Filtrar subscription de `conversas` pelo `tenant_id`
Mesmo princípio para o canal `conversas-realtime`.

### 3. Polling de fallback (segurança)
Adicionar um `setInterval` de 15 segundos que faz `fetchConversas()` como fallback caso o WebSocket falhe silenciosamente. Isso garante que mesmo se o realtime falhar, a lista atualiza em poucos segundos.

### 4. Atualizar mensagens da conversa ativa
Quando chegar um evento realtime de `conversas` indicando mudança na conversa selecionada, também re-buscar as mensagens.

## Arquivo afetado
- `src/pages/Conversas.tsx` — ajustar os dois canais de realtime + adicionar polling de fallback

