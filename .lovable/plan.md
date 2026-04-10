

# Adicionar Nós de Giftback ao Builder de Fluxos

## Visao Geral
Adicionar 3 novos tipos de no ao builder de fluxos, especificos para operacoes de giftback, permitindo que automacoes WhatsApp e giftback coexistam no mesmo canvas.

## Novos Tipos de No

### 1. Consultar Saldo (icone: Wallet, cor: teal)
- Busca o saldo giftback do contato atual
- Config: variavel de saida (default `{{saldo_giftback}}`)
- Preview: "Saldo → {{saldo_giftback}}"

### 2. Notificar Credito (icone: Gift, cor: emerald)
- Envia notificacao de credito giftback gerado
- Config: template da mensagem (com variaveis `{{valor}}`, `{{validade}}`), canal (WhatsApp/SMS)
- Preview: primeiros 40 chars do template

### 3. Lembrete de Validade (icone: CalendarClock, cor: amber)
- Dispara lembrete quando giftback esta proximo de expirar
- Config: dias antes da expiracao, template da mensagem
- Preview: "X dias antes | template..."

## Arquivos a alterar

### `src/components/fluxos/nodeTypes.ts`
- Adicionar 3 entradas: `consultar_saldo`, `notificar_credito`, `lembrete_validade`

### `src/components/fluxos/nodes/FlowNode.tsx`
- Adicionar cases no `getPreview()` para os 3 novos tipos

### `src/components/fluxos/NodeConfigPanel.tsx`
- Adicionar 3 blocos de formulario de configuracao

## Detalhes tecnicos
- Sem migration necessaria — os dados dos nos sao armazenados como JSON dentro da coluna `nodes_json` existente
- Os novos nos usam o mesmo componente `FlowNode` (type: "flowNode") com `nodeType` diferente
- Icones do lucide-react: `Wallet`, `Gift`, `CalendarClock`

