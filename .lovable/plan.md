

# Nó Menu — Modo Lista vs. Botões

## O que muda

Adicionar um seletor dentro do nó "menu" para o usuário escolher entre dois modos de envio:

- **Lista** (atual): envia texto numerado (1. Opção A, 2. Opção B...) — o cliente responde digitando o número
- **Botões**: envia como botões interativos do WhatsApp (máximo 3 botões) — o cliente toca no botão

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `NodeConfigPanel.tsx` | Adicionar Select "Tipo de menu" (`lista` / `botoes`) acima das opções. Se `botoes`, limitar a 3 opções |
| `FlowNode.tsx` | Mostrar badge "Lista" ou "Botões" no preview do nó |
| `zapi-webhook/index.ts` | No handler do nó menu, se `tipo_menu === "botoes"`, enviar via endpoint de botões da Z-API em vez de texto numerado |

## Detalhes técnicos

### Config armazenada
```typescript
{
  tipo_menu: "lista" | "botoes",  // default "lista"
  pergunta: string,
  opcoes: string[],
  fallback: string
}
```

### NodeConfigPanel
- Novo `Select` com label "Tipo de menu" logo após o campo de pergunta
- Se `botoes` selecionado, limitar máximo de opções a 3 (limite do WhatsApp) e mostrar aviso se houver mais

### FlowNode preview
- Exibir um badge pequeno ("📋 Lista" ou "🔘 Botões") abaixo do header

### Webhook (zapi-webhook)
- Se `tipo_menu === "botoes"`: usar endpoint Z-API `/send-button-list` com payload de botões interativos
- Se `lista` (default): manter comportamento atual de texto numerado

