

# Nó de Gerenciamento de Conversa + Auto-Off com "Religar"

## Resumo

Duas mudanças:
1. **Novo nó "Gerenciar Conversa"** — permite abrir ou fechar uma conversa dentro do fluxo, conectando com a funcionalidade do módulo Conversas (que já usa `status: "aberta" | "fechada"`)
2. **Auto-Off com modo "Religar"** — adicionar uma opção ao nó auto_off para limpar o bloqueio de respostas automáticas (usar no final dos fluxos para reativar)

---

## 1. Novo nó: `gerenciar_conversa`

### `nodeTypes.ts`
- Adicionar tipo `gerenciar_conversa` com ícone `DoorOpen` ou `MessageSquareOff`, cor distinta

### `NodeConfigPanel.tsx`
- Config com select de ação: `"fechar"` ou `"abrir"`
- Campo opcional `motivo` (texto livre, salvo como nota/metadata)

### `FlowNode.tsx`
- Preview: "Fechar conversa" ou "Abrir conversa"

### `zapi-webhook/index.ts` (handler no `executeFlowFrom`)
- `case "gerenciar_conversa"`:
  - Se `config.acao === "fechar"`: `UPDATE conversas SET status = 'fechada' WHERE id = conversaId`
  - Se `config.acao === "abrir"`: `UPDATE conversas SET status = 'aberta' WHERE id = conversaId`
  - Continua para o próximo nó

---

## 2. Auto-Off com opção "Religar"

### `NodeConfigPanel.tsx`
- Adicionar um select no topo do bloco auto_off: **Ação** → `"desligar"` (padrão atual) ou `"religar"`
- Quando `acao === "religar"`, esconder os campos de tempo (não precisa de duração)
- Label muda para "Religar resposta automática"

### `FlowNode.tsx`
- Preview: se `config.acao === "religar"` → mostrar "⚡ Religar auto" em vez do timer

### `zapi-webhook/index.ts`
- No handler `auto_off`:
  - Se `config.acao === "religar"`: limpar `auto_off_ate` da sessão (`dados: { auto_off_ate: null }`)
  - Caso contrário: comportamento atual (setar timer)

---

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/components/fluxos/nodeTypes.ts` | Adicionar `gerenciar_conversa` |
| `src/components/fluxos/NodeConfigPanel.tsx` | Config do novo nó + toggle religar no auto_off |
| `src/components/fluxos/nodes/FlowNode.tsx` | Preview dos dois |
| `supabase/functions/zapi-webhook/index.ts` | Handler `gerenciar_conversa` + lógica religar no `auto_off` |

