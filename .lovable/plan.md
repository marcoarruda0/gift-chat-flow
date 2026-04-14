

# Mudanças Estéticas e Funcionais nos Nós do Fluxo

## 1. Handles horizontais (entrada esquerda, saída direita)

Trocar todos os `Position.Top` (target) para `Position.Left` e `Position.Bottom` (source) para `Position.Right`.

Para nós especiais:
- **Menu**: handles de opções empilhados verticalmente no lado direito (distribuídos por `top` em vez de `left`)
- **Condicional**: handles "sim" e "nao" empilhados verticalmente no lado direito (top 35% e 65%)

**Arquivo:** `src/components/fluxos/nodes/FlowNode.tsx`

## 2. Context menu (duplicar / excluir) ao clicar no nó

Ao clicar com botão direito (ou via botões que aparecem ao selecionar), mostrar opções "Duplicar" e "Excluir".

Abordagem: adicionar um pequeno toolbar flutuante que aparece quando o nó está selecionado (`selected === true`), posicionado no canto superior direito do nó, com dois botões de ícone (Copy + Trash2).

As ações de duplicar e excluir precisam ser executadas no `FluxoEditor.tsx`, então passaremos callbacks `onDuplicate` e `onDelete` via `data` do nó.

**Arquivos:**
- `src/components/fluxos/nodes/FlowNode.tsx` — toolbar com botões ao selecionar
- `src/pages/FluxoEditor.tsx` — funções `duplicateNode` e `deleteNode`, passadas via `data` de cada nó

### Detalhes técnicos

| Arquivo | Mudança |
|---------|---------|
| `FlowNode.tsx` | `Position.Top` → `Position.Left`, `Position.Bottom` → `Position.Right`; toolbar flutuante com Duplicar/Excluir quando `selected` |
| `FluxoEditor.tsx` | Funções `duplicateNode(nodeId)` e `deleteNode(nodeId)`; injetar callbacks no `data` dos nós |

