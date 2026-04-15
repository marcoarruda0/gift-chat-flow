

# Plano: "Puxar Conversa" — Atendente só responde se a conversa estiver com ele

## Conceito

Hoje qualquer atendente pode enviar mensagens em qualquer conversa. A mudança cria um fluxo onde o atendente precisa **"puxar"** (assumir) a conversa antes de poder responder. Isso permite medir tempo de atendimento (início = puxou, fim = fechou).

## Mudanças

### 1. Banco de dados — Campos de controle de tempo

**Migration SQL:**
- Adicionar coluna `atendimento_iniciado_at` (timestamptz, nullable) na tabela `conversas` — registra quando o atendente puxou a conversa
- Adicionar coluna `atendimento_encerrado_at` (timestamptz, nullable) — registra quando foi fechada

Quando o atendente "puxa", `atendente_id` é setado e `atendimento_iniciado_at = now()`. Quando fecha, `atendimento_encerrado_at = now()`.

### 2. ChatPanel — Botão "Puxar Conversa" e bloqueio do input

**`src/components/conversas/ChatPanel.tsx`:**
- Receber nova prop `isAssignedToMe: boolean` e callback `onPull: () => void`
- Se `isAssignedToMe === false`: esconder o `ChatInput` e mostrar um banner com botão **"Puxar Conversa"**
- Se `isAssignedToMe === true`: mostrar o `ChatInput` normalmente (comportamento atual)
- O banner mostra: "Você precisa puxar esta conversa para poder responder" + botão azul "Puxar Conversa"

### 3. Conversas.tsx — Lógica de puxar e controle

**`src/pages/Conversas.tsx`:**
- Calcular `isAssignedToMe = selected?.atendente_id === user?.id`
- Nova função `handlePull`:
  - `UPDATE conversas SET atendente_id = user.id, atendimento_iniciado_at = now() WHERE id = selectedId`
  - Insere mensagem de sistema: "Conversa assumida por {nome}"
  - Atualiza estado local
- Ao fechar (`handleClose`): adicionar `atendimento_encerrado_at = now()` no update
- Passar `isAssignedToMe` e `onPull` para o `ChatPanel`

### 4. ConversasList — Indicador visual

**`src/components/conversas/ConversasList.tsx` / `ConversaItem.tsx`:**
- Mostrar um ícone ou badge sutil quando a conversa já tem atendente (ex: ícone de pessoa ao lado do nome)
- Diferenciar visualmente conversas "livres" (sem atendente) das "assumidas"

## Fluxo do usuário

```text
1. Conversa chega (via WhatsApp/webhook) → sem atendente_id
2. Atendente clica na conversa → vê mensagens mas NÃO pode responder
3. Clica "Puxar Conversa" → atendente_id = seu id, atendimento_iniciado_at = now()
4. Agora pode responder normalmente
5. Fecha conversa → atendimento_encerrado_at = now()
   Tempo de atendimento = encerrado - iniciado
```

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| Migration SQL | `atendimento_iniciado_at`, `atendimento_encerrado_at` em `conversas` |
| `src/components/conversas/ChatPanel.tsx` | Props `isAssignedToMe` + `onPull`, banner de puxar, esconder input |
| `src/pages/Conversas.tsx` | `handlePull`, `isAssignedToMe`, timestamp no close |
| `src/components/conversas/ConversaItem.tsx` | Indicador visual de conversa assumida |

