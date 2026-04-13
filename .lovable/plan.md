

# Nó "Menu" no Editor de Fluxos

## Conceito (baseado na referência BotConversa)

O nó Menu permite criar uma pergunta com múltiplas opções de resposta (botões). Cada opção gera uma saída independente no fluxo, permitindo ramificações dinâmicas. Inclui também uma saída "Se usuário não responder" como fallback.

## Arquivos a modificar

### 1. `src/components/fluxos/nodeTypes.ts`
- Adicionar tipo `menu` com ícone `List`, cor roxa/azul distinguível dos demais

### 2. `src/components/fluxos/nodes/FlowNode.tsx`
- Tratar `nodeType === "menu"` como caso especial (similar ao `condicional`)
- Renderizar **múltiplos Handles de saída** na parte inferior — um para cada opção configurada + um handle "fallback" (não respondeu)
- Exibir as opções como mini-botões dentro do corpo do nó para visualização rápida
- Preview: mostrar texto da pergunta truncado

### 3. `src/components/fluxos/NodeConfigPanel.tsx`
- Adicionar seção de configuração para `nodeType === "menu"`:
  - **Texto da pergunta** (textarea)
  - **Lista de opções** (array dinâmico):
    - Cada opção: campo de texto + botão remover
    - Botão "Adicionar opção" (máx ~10)
  - **Texto fallback** — mensagem se usuário não responder
- Config armazenada como: `{ pergunta: string, opcoes: string[], fallback_texto: string }`

### 4. `src/pages/FluxoEditor.tsx`
- Nenhuma mudança necessária — o onDrop já cria nós genéricos com `type: "flowNode"` e o nodeType vem do drag data

## Visualização do nó no canvas

```text
┌──────────────────────┐
│ 🔹 Menu              │  ← header colorido
├──────────────────────┤
│ "Para qual setor..." │  ← preview da pergunta
│ ┌──────────────────┐ │
│ │ Resposta 1       │ │  ← mini-botões visuais
│ │ Resposta 2       │ │
│ │ Resposta 3       │ │
│ └──────────────────┘ │
├──────────────────────┤
│  ●    ●    ●    ●    │  ← handles de saída (1 por opção + fallback)
└──────────────────────┘
```

Cada handle terá um `id` correspondente ao índice da opção (`opcao_0`, `opcao_1`, ..., `fallback`), permitindo conexões independentes para cada caminho.

## Resumo de mudanças
| Arquivo | Ação |
|---------|------|
| `nodeTypes.ts` | Adicionar entrada `menu` |
| `FlowNode.tsx` | Renderização especial com handles dinâmicos + preview de opções |
| `NodeConfigPanel.tsx` | Formulário de pergunta + lista editável de opções |

