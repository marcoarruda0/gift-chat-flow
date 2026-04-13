

# Melhorias na Barra Superior do Chat

## Mudanças

### 1. Ícone de fechar conversa: `X` → `CheckCircle`
Trocar o ícone `X` (lucide `X`) por `CheckCircle` (lucide `CheckCircle2`) no botão `onClose`, com title "Encerrar conversa". Isso deixa claro que é uma ação de finalizar/concluir o atendimento.

### 2. Mostrar departamento e atendente na barra superior
Adicionar duas informações entre o nome do contato e os botões de ação:
- **Departamento**: badge com ícone `Building2` + nome do departamento
- **Atendente**: badge com ícone `User` + nome do atendente

Ficará assim na barra:
```text
[Avatar] Nome do contato    [Depto: Vendas] [Atendente: João]   [Transferir] [Não lida] [✓ Encerrar]
         telefone
```

### Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/components/conversas/ChatPanel.tsx` | Trocar ícone X por CheckCircle2. Adicionar props `departamentoNome` e `atendenteNome`. Renderizar badges na barra superior. |
| `src/pages/Conversas.tsx` | Buscar nomes do departamento e atendente (via joins ou lookups em `departamentos` e `profiles`) e passar como props ao ChatPanel. |

### Detalhes técnicos

- Na página `Conversas.tsx`, o `selected` já tem `departamento_id` e `atendente_id`. Preciso fazer lookup para obter os nomes:
  - Buscar departamentos do tenant uma vez e mapear por ID
  - Buscar profiles do tenant uma vez e mapear por ID
- Passar `departamentoNome` e `atendenteNome` como props opcionais ao `ChatPanel`

