## Objetivo

Tornar as duas novas edge functions (`saldos-consultar` e `saldos-confirmar`) facilmente acessíveis para o usuário dentro de **Vendas Online → Configurações**, no mesmo padrão visual do card "Integração Blinkchat" que já existe ali.

As funções já estão implementadas e públicas — falta apenas a UI para expor as URLs prontas para colar no BlinkChat.

## O que será feito

### 1. Novo card em `src/pages/VendasOnlineConfig.tsx`

Logo abaixo do card "Integração Blinkchat" existente, adicionar um novo card:

**Título:** "Integração Saldos Externos (BlinkChat)"
**Descrição:** "Dois endpoints públicos que permitem ao BlinkChat consultar saldos de Moeda PR + Consignado por CPF e debitar quando o cliente confirmar a compra. Use o mesmo token de integração BlinkChat acima."

**Conteúdo:**
- **URL 1 — Consultar saldo (POST)**: campo readonly + botão copiar
  `https://{PROJECT_ID}.supabase.co/functions/v1/saldos-consultar/{blinkchat_token}`
  Body esperado: `{ "cpf": "string", "valor_item": number }`

- **URL 2 — Confirmar venda (POST)**: campo readonly + botão copiar
  `https://{PROJECT_ID}.supabase.co/functions/v1/saldos-confirmar/{blinkchat_token}`
  Body esperado: `{ "cpf": "string", "valor_item": number, "confirmado": true }`

- Bloco "Formato da resposta" estilo o card BlinkChat existente, mostrando exemplos JSON dos retornos `ok:true` (com saldo / com débito) e `ok:false` (saldo insuficiente, CPF não encontrado, duplicado).

- Aviso: "Compartilha o mesmo token do card acima — rotacionar o token invalida ambas as integrações simultaneamente."

### 2. Reaproveitamento

- Reusa **o mesmo `blinkchat_token`** já carregado no estado do componente (`blinkchatToken`).
- Reusa a função `copy()` já existente.
- Reusa o botão "Rotacionar token" já existente no card BlinkChat — não duplicar.
- Se `blinkchat_token` não existir, mostra "Carregando token de integração…" igual ao card BlinkChat.

## Detalhes técnicos

```text
src/pages/VendasOnlineConfig.tsx
  └── (entre o card "Integração Blinkchat" e o botão Salvar)
       └── novo <Card> "Integração Saldos Externos (BlinkChat)"
            ├── URL saldos-consultar (Input readonly + Copy)
            ├── URL saldos-confirmar (Input readonly + Copy)
            └── Bloco JSON de exemplo (sucesso + erros)
```

Sem mudanças em backend, edge functions, migrações, rotas ou outros arquivos. Apenas frontend de apresentação.

## Fora do escopo

- Tela de teste interativo (como `BlinkchatTeste.tsx`) — pode ser feita depois se solicitado.
- Histórico de vendas (`saldos_vendas`) na página `/saldos-externos` — também pode ser feito separadamente.
