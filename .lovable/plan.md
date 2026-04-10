

# Módulo de Conversas — Layout WhatsApp Web

## Visão Geral
Tela de conversas com layout dividido: lista de conversas à esquerda e painel de chat à direita, similar ao WhatsApp Web. Dados persistidos no banco com realtime para mensagens.

---

## 1. Tabelas (Migration)

### `conversas`
- `id`, `tenant_id`, `contato_id` (ref contatos), `ultimo_texto`, `ultima_msg_at`, `status` (aberta/fechada), `atendente_id` (nullable, ref profiles), `nao_lidas` int, `created_at`
- RLS por tenant_id

### `mensagens`
- `id`, `tenant_id`, `conversa_id` (ref conversas), `remetente` (enum: contato/atendente/bot), `tipo` (texto/imagem/audio/video/documento), `conteudo` text, `metadata` jsonb, `created_at`
- RLS por tenant_id
- Realtime habilitado (`ALTER PUBLICATION supabase_realtime ADD TABLE mensagens`)

## 2. Página `/conversas` — Layout full-height

### Painel Esquerdo (lista de conversas, ~350px)
- Campo de busca no topo
- Lista scrollável de conversas com: avatar/iniciais do contato, nome, preview última mensagem, horário, badge de não lidas
- Filtros: Todas / Abertas / Minhas / Fechadas
- Conversa selecionada com destaque visual
- Estado vazio quando não há conversas

### Painel Direito (chat)
- **Header**: nome do contato, telefone, botões (fechar conversa, ver perfil)
- **Área de mensagens**: scroll com mensagens estilo bolha (esquerda = contato, direita = atendente/bot), com horário
- **Input**: textarea com botão enviar, atalho Enter para enviar
- Estado vazio quando nenhuma conversa selecionada ("Selecione uma conversa")

### Responsivo (mobile)
- No mobile, mostra só a lista; ao selecionar conversa, mostra só o chat com botão voltar

## 3. Realtime
- Subscribe em `mensagens` para atualizar chat em tempo real
- Subscribe em `conversas` para atualizar lista (novas msgs, contadores)

## 4. Arquivos

| Arquivo | Descrição |
|---------|-----------|
| Migration SQL | Tabelas `conversas` e `mensagens` + RLS + realtime |
| `src/pages/Conversas.tsx` | Página principal com layout split |
| `src/components/conversas/ConversasList.tsx` | Lista lateral de conversas |
| `src/components/conversas/ConversaItem.tsx` | Item individual na lista |
| `src/components/conversas/ChatPanel.tsx` | Painel de chat completo |
| `src/components/conversas/MessageBubble.tsx` | Bolha de mensagem |
| `src/components/conversas/ChatInput.tsx` | Input de mensagem |
| `src/App.tsx` | Atualizar rota `/conversas` |
| `src/components/AppLayout.tsx` | Variante sem padding para a página de conversas |

## 5. Layout especial
A página de Conversas precisa ocupar 100% da altura sem padding. O `AppLayout` será ajustado para permitir que children controlem seu próprio padding (a rota `/conversas` não terá o `p-4` padrão).

