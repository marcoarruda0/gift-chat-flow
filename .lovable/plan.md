

# Sincronização WhatsApp com Seletor de Datas

## Situação atual

A sincronização atual (`handleSync`) busca todos os chats via `chats` endpoint do Z-API e importa as últimas 50 mensagens de cada. Não há filtro de datas — importa tudo de uma vez.

## Solução

Criar um dialog de sincronização com seletor de datas (de/até), onde o usuário escolhe o período e o sistema busca as conversas do WhatsApp naquele intervalo usando o Z-API.

### Como funciona

1. Usuário clica no botão de sync → abre dialog com date picker (de/até)
2. Sistema busca os chats via `chats` endpoint do Z-API (lista todos os chats)
3. Para cada chat, busca mensagens via `load-messages-chat-phone/{phone}` filtrando pelo período selecionado (timestamp)
4. Importa apenas mensagens dentro do intervalo, criando contatos e conversas conforme necessário
5. Progresso visual com barra e contadores

### Componentes

**Novo: `SincronizarWhatsappDialog.tsx`**
- Dialog com dois date pickers (data início / data fim)
- Default: última semana
- Botão "Sincronizar"
- Barra de progresso durante importação
- Contador: "Importando chat 3/15... 47 mensagens"
- Ao finalizar: resumo (X conversas, Y mensagens importadas)

**Mudança em `Conversas.tsx`**
- Botão de sync agora abre o dialog em vez de chamar `handleSync` direto
- Lógica de importação movida para dentro do dialog (com filtro de timestamps)

**Mudança em `ConversasList.tsx`**
- Nenhuma mudança visual necessária — o botão de sync já existe

### Lógica de filtro por data

O Z-API retorna mensagens com campo `timestamp` (unix seconds). O filtro é aplicado client-side:
```typescript
const startTs = Math.floor(startDate.getTime() / 1000);
const endTs = Math.floor(endDate.getTime() / 1000);
const filteredMsgs = rawMsgs.filter(m => m.timestamp >= startTs && m.timestamp <= endTs);
```

Sem o limite de 50 mensagens — importa todas do período selecionado.

### Melhorias sobre o sync atual
- Controle do período (não importa tudo)
- Sem limite de 50 msgs — traz todas do período
- Feedback visual melhor (progresso por chat)
- Pode ser executado várias vezes para períodos diferentes
- Deduplicação mantida via `zapi_message_id`

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/components/conversas/SincronizarWhatsappDialog.tsx` | Novo — dialog com date pickers e lógica de sync |
| `src/pages/Conversas.tsx` | Botão sync abre dialog; remover `handleSync` inline |

