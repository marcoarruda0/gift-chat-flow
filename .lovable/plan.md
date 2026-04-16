

## Plano: Bloquear fechamento de conversa sem "Puxar Conversa"

Hoje o botão de encerrar conversa (ícone verde de check no header do `ChatPanel`) está sempre visível e clicável, mesmo quando o atendente não puxou a conversa. Isso permite fechar conversas sem registrar `atendimento_iniciado_at`, quebrando as métricas do relatório de atendimento.

## Mudança

**`src/components/conversas/ChatPanel.tsx`**:
- O botão "Encerrar conversa" (CheckCircle2 verde no header) só aparece quando `isAssignedToMe === true`
- Quando a conversa não está com o atendente, o botão fica oculto — o usuário só vê o banner "Puxar Conversa" no rodapé

## Resultado

- Sem puxar → não consegue fechar (botão oculto)
- Puxou → pode responder e fechar normalmente
- Garante que toda conversa fechada terá `atendimento_iniciado_at` e `atendimento_encerrado_at` preenchidos, mantendo as métricas de tempo médio consistentes

## Arquivo afetado

| Arquivo | Mudança |
|---------|---------|
| `src/components/conversas/ChatPanel.tsx` | Renderizar botão de encerrar somente se `isAssignedToMe` |

