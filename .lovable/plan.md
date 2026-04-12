

# Transferência de Conversas entre Atendentes

## Objetivo
Permitir que um atendente transfira uma conversa para outro membro da equipe, com registro de histórico e notificação.

## Alterações

### 1. Migration — Tabela `conversa_transferencias` (histórico)

Colunas: `id` (uuid), `conversa_id` (uuid), `tenant_id` (uuid), `de_user_id` (uuid), `para_user_id` (uuid), `motivo` (text, nullable), `created_at`.

RLS: isolamento por `tenant_id`, todos do tenant podem ler, atendentes podem inserir.

A coluna `atendente_id` já existe na tabela `conversas` — será usada para indicar o atendente responsável atual.

### 2. UI — Botão "Transferir" no header do ChatPanel

- Novo botão no header do chat (ícone `ArrowRightLeft` ou `UserPlus`)
- Ao clicar, abre um Dialog listando os membros do tenant (query em `profiles` onde `tenant_id` = atual, excluindo o usuário logado)
- Campo opcional de motivo (textarea)
- Ao confirmar: atualiza `conversas.atendente_id` para o novo atendente e insere registro em `conversa_transferencias`
- Mensagem de sistema inserida na conversa ("Conversa transferida de X para Y")

### 3. Atualização do `Conversas.tsx`

- Passar `onTransfer` callback para `ChatPanel`
- Função `handleTransfer(paraUserId, motivo)`:
  1. Update `conversas.atendente_id = paraUserId`
  2. Insert em `conversa_transferencias`
  3. Insert mensagem de sistema (remetente: `"sistema"`, tipo: `"texto"`, conteúdo: "Transferido de X para Y")
  4. Toast de confirmação

### 4. Filtro "Minhas" na lista de conversas

- O filtro "Minhas" na `ConversasList` (já existe o label) passará a funcionar filtrando por `atendente_id = auth.uid()`
- Conversas sem `atendente_id` aparecem em "Todas" (fila geral)

## Arquivos criados/alterados

| Arquivo | Tipo |
|---------|------|
| Migration (conversa_transferencias + RLS) | Novo |
| `src/components/conversas/TransferirDialog.tsx` | Novo (dialog de seleção de atendente) |
| `src/components/conversas/ChatPanel.tsx` | Alterado (botão transferir no header) |
| `src/pages/Conversas.tsx` | Alterado (handleTransfer + prop onTransfer + filtro "Minhas") |
| `src/components/conversas/ConversasList.tsx` | Alterado (lógica do filtro "Minhas") |

## Detalhes Técnicos

- A query de membros usa a tabela `profiles` filtrada por `tenant_id`, já acessível via RLS existente
- Mensagem de sistema usa remetente `"sistema"` — verificar se o enum `remetente_tipo` inclui esse valor; se não, adicionar via migration
- O histórico em `conversa_transferencias` permite auditoria completa de quem transferiu para quem e quando
- Realtime já está ativo na tabela `conversas`, então o novo atendente verá a conversa aparecer automaticamente

