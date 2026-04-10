

# Nova Conversa a partir de Contato Existente

## Visão Geral
Adicionar duas formas de iniciar uma conversa com um contato existente:
1. **Botão na tabela de Contatos** — ícone de chat em cada linha
2. **Botão "Nova Conversa" na lista de Conversas** — abre dialog para selecionar contato

Nos dois casos, se já existir conversa aberta com o contato, redireciona para ela ao invés de criar duplicata.

---

## Alterações

### 1. `src/pages/Contatos.tsx`
- Adicionar botão com ícone `MessageSquarePlus` na coluna de ações de cada contato
- Ao clicar: verificar se já existe conversa aberta para o contato → se sim, navegar para `/conversas?id=<conversa_id>` → se não, criar nova conversa e navegar

### 2. `src/components/conversas/ConversasList.tsx`
- O botão `MessageSquarePlus` já existe mas não faz nada
- Conectar ao callback `onNewConversa` que abrirá o dialog de seleção de contato

### 3. Novo: `src/components/conversas/NovaConversaDialog.tsx`
- Dialog com campo de busca que lista contatos do tenant
- Ao selecionar contato: verifica se já há conversa aberta → redireciona ou cria nova
- Busca contatos via Supabase com filtro por nome/telefone

### 4. `src/pages/Conversas.tsx`
- Ler query param `?id=` da URL para pré-selecionar conversa (vindo da página de contatos)
- Adicionar função `criarConversa(contatoId)` reutilizável
- Passar callback `onNewConversa` para `ConversasList`

### 5. Sem migration necessária
As tabelas `conversas` e `contatos` já existem com os campos necessários.

## Fluxo do usuário
1. Na página de Contatos, clica no ícone de chat → redireciona para `/conversas` com a conversa aberta
2. Na página de Conversas, clica no `+` → busca contato → seleciona → conversa abre no painel direito

