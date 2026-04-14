

# Correções no Módulo Fluxos: Menu (4 botões) + Novo Nó Auto-Off

## 1. Nó Menu — Permitir 4 botões

O WhatsApp na verdade permite até **3 reply buttons**, mas a API de listas permite até 10 seções. O usuário pediu "4 botões", então vamos aumentar o limite de botões interativos de 3 para 4.

**Mudança em `NodeConfigPanel.tsx`:**
- Linha 597-598: trocar limite de `3` para `4`
- Linha 608: atualizar texto de "Máximo 3" para "Máximo 4"
- Linha 649: trocar `3` para `4`

## 2. Novo Nó "Auto-Off" — Pausar resposta automática

Baseado na referência (imagem enviada), o Auto-Off é um nó que **pausa a resposta automática por um tempo determinado** (formato `HH:MM:SS` ou dias). Isso evita que o contato receba a mesma mensagem de boas-vindas/início do fluxo repetidamente após ser atendido.

**Mudanças:**

### `nodeTypes.ts`
- Adicionar `auto_off` com ícone `TimerOff` (lucide), cor vermelha/alaranjada

### `NodeConfigPanel.tsx`
- Nova seção para `auto_off`:
  - Label "Desligar resposta padrão por"
  - 3 campos numéricos lado a lado: Horas / Minutos / Segundos (formato `HH:MM:SS` como na referência)
  - Campo adicional: opção de dias (Select com "Horas:Min:Seg" / "Dias")
  - Descrição explicativa: "A resposta automática será pausada para este contato pelo tempo definido"

### `FlowNode.tsx`
- Preview: mostrar o tempo formatado (ex: `00:05:00`)
- Handles: entrada à esquerda, saída à direita (padrão)

### `NodePalette.tsx`
- Verificar se `auto_off` aparece automaticamente (provavelmente já lista todos do `NODE_TYPE_CONFIG`)

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/components/fluxos/nodeTypes.ts` | Adicionar `auto_off` |
| `src/components/fluxos/NodeConfigPanel.tsx` | Limite 4 no menu; seção config `auto_off` |
| `src/components/fluxos/nodes/FlowNode.tsx` | Preview do `auto_off` |

