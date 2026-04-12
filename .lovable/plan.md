

# Campo "Apelido" com Assinatura nas Mensagens

## Objetivo
Adicionar campo "apelido" no perfil do usuário e um checkbox por membro na gestão de equipe ("Mostrar apelido"). Quando ativo, as mensagens enviadas pelo atendente no módulo Conversas exibirão o apelido em negrito acima do texto.

## Alterações

### 1. Migration — Novas colunas em `profiles`

- `apelido` (text, nullable) — o apelido do atendente
- `mostrar_apelido` (boolean, default false) — se o apelido deve aparecer nas mensagens

### 2. Página Empresa (aba Equipe)

- Adicionar coluna "Apelido" na tabela de membros com input editável (admin pode alterar)
- Adicionar checkbox "Mostrar" ao lado do apelido para controlar `mostrar_apelido`
- Ao alterar, fazer update direto em `profiles`

### 3. Envio de mensagens (`Conversas.tsx`)

- No `handleSend`, se o usuário logado tem `mostrar_apelido = true` e `apelido` preenchido:
  - Prefixar a mensagem com `*{apelido}:*\n` (negrito WhatsApp) antes de enviar via Z-API
  - Salvar no banco com o apelido no campo `metadata.senderName` para exibição local
- Mesma lógica para `handleSendAudio` e `handleSendAttachment`

### 4. Exibição no chat (`MessageBubble.tsx`)

- Mensagens do tipo `atendente` que possuem `metadata.senderName` já exibem o nome (lógica existente para mensagens de contato)
- Ajustar para também exibir em mensagens outgoing (remetente = "atendente") quando `senderName` está presente, em negrito

### 5. AuthContext — Expor apelido no profile

- Adicionar `apelido` e `mostrar_apelido` à interface `Profile` no AuthContext para acesso fácil

## Arquivos criados/alterados

| Arquivo | Tipo |
|---------|------|
| Migration (colunas apelido + mostrar_apelido) | Novo |
| `src/contexts/AuthContext.tsx` | Alterado (interface Profile) |
| `src/pages/Empresa.tsx` | Alterado (coluna apelido + checkbox na equipe) |
| `src/pages/Conversas.tsx` | Alterado (prefixar mensagem com apelido) |
| `src/components/conversas/MessageBubble.tsx` | Alterado (exibir apelido em mensagens outgoing) |

## Detalhes Técnicos

- No WhatsApp, `*texto*` renderiza em negrito — o apelido será enviado como `*Marco Arruda:*\n mensagem`
- No sistema, o `MessageBubble` usará `metadata.senderName` para exibir o apelido em negrito com `font-semibold`
- O checkbox `mostrar_apelido` é por usuário, controlado pelo admin na aba Equipe
- A coluna `apelido` também pode ser editada pelo próprio usuário no futuro (perfil pessoal)

