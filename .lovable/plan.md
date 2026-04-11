

# Gestão de Empresa — Usuários e Instâncias por Empresa

## Contexto Atual
O sistema já possui multi-tenancy (tabela `tenants`, `profiles` com `tenant_id`, RLS por tenant). Porém falta:
- UI para gerenciar dados da empresa
- Convidar/gerenciar usuários da equipe
- Visualizar instâncias (Z-API) vinculadas à empresa

## Alterações

### 1. Migration — Tabela `convites`
Nova tabela para convites de usuários à empresa:
- `id`, `tenant_id`, `email`, `role` (app_role), `convidado_por` (uuid), `status` (pendente/aceito/expirado), `token` (unique), `created_at`, `expires_at`
- RLS: tenant pode ver/inserir/deletar seus convites; admin_tenant ou admin_master apenas

### 2. Migration — Ajustes
- Adicionar coluna `cnpj` e `telefone_empresa` na tabela `tenants` para dados da empresa

### 3. Página `src/pages/Empresa.tsx`
Três abas (Tabs):
- **Dados da Empresa**: Nome, CNPJ, telefone — editar e salvar (tabela `tenants`)
- **Equipe**: Lista de usuários do tenant (query `profiles` por `tenant_id`), com nome, email (do auth via metadata), departamento, role. Botão "Convidar" que abre dialog com email + role (operador/admin_tenant)
- **Instâncias**: Lista de configurações Z-API do tenant (`zapi_config`), mostrando instance_id e status

### 4. Edge Function `aceitar-convite`
- Recebe token do convite
- Valida que não expirou e está pendente
- No signup, o `handle_new_user` será ajustado: se houver convite pendente para aquele email, associar o user ao tenant do convite (em vez de criar novo tenant)

### 5. Ajustar trigger `handle_new_user`
- Antes de criar novo tenant, verificar se existe convite pendente para o email
- Se sim: usar o `tenant_id` do convite, marcar convite como aceito, atribuir o role do convite
- Se não: comportamento atual (cria novo tenant)

### 6. Rota + Sidebar
- Rota `/empresa` no `App.tsx`
- Link "Empresa" no sidebar com ícone `Building2`

## Arquivos criados/alterados

| Arquivo | Tipo |
|---------|------|
| Migration (convites + tenants cnpj/telefone) | Novo |
| Migration (atualizar handle_new_user) | Novo |
| `src/pages/Empresa.tsx` | Novo |
| `supabase/functions/aceitar-convite/index.ts` | Novo |
| `src/App.tsx` | Alterado (rota) |
| `src/components/AppSidebar.tsx` | Alterado (link) |

## Detalhes Técnicos

- Convites usam token UUID gerado no insert. O link de convite será `{origin}/login?convite={token}`
- A página de Login detecta `?convite=` na URL e exibe formulário de signup pré-preenchido com o email
- RLS da tabela `convites`: SELECT/INSERT/DELETE para `admin_tenant` e `admin_master` do mesmo tenant
- A consulta de equipe usa `profiles` filtrado por `tenant_id` (policy `tenant_users_view_team` já existe)

