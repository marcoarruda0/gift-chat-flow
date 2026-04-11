

# Admin: Gerenciar Membros da Equipe

## Objetivo
Permitir que admins (admin_tenant/admin_master) alterem a função e removam membros da equipe diretamente na aba Equipe da página Empresa.

## Alterações

### 1. Migration — RLS para admin gerenciar roles e remover profiles
- Adicionar policy na `user_roles` para `admin_tenant` poder UPDATE e DELETE roles de usuários do mesmo tenant
- Adicionar policy na `profiles` para `admin_tenant` poder DELETE profiles do mesmo tenant
- Criar função security definer `is_same_tenant(target_user_id)` para verificar se o usuário-alvo pertence ao mesmo tenant

### 2. Edge Function `gerenciar-membro/index.ts`
Como alterar role e remover membro envolve operações cross-table (deletar profile + role, ou atualizar role), usar uma edge function com service_role_key para:
- **Alterar função**: Recebe `user_id` + `new_role`, atualiza `user_roles`
- **Remover membro**: Recebe `user_id`, deleta de `user_roles`, `profiles`, e desativa o auth user (via admin API)
- Validação: não pode remover a si mesmo, não pode alterar admin_master

### 3. UI em `src/pages/Empresa.tsx`
- Adicionar coluna "Ações" na tabela de equipe (visível apenas para admins)
- **Alterar função**: Dropdown/Select inline na coluna "Função" para admin editar diretamente
- **Remover membro**: Botão de lixeira com confirmação (AlertDialog)
- Não mostrar ações para o próprio usuário logado
- Feedback via toast

## Arquivos criados/alterados

| Arquivo | Tipo |
|---------|------|
| Migration (RLS policies) | Novo |
| `supabase/functions/gerenciar-membro/index.ts` | Novo |
| `src/pages/Empresa.tsx` | Alterado (ações na tabela) |

