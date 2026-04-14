

# Ajustes: Sidebar, Limpeza de Dados, Multi-Empresa e Vínculo Usuário-Empresa

## Resumo

Quatro mudanças: reorganizar sidebar, criar função de limpeza de dados, suportar múltiplas empresas, e permitir um usuário pertencer a mais de uma empresa.

---

## 1. Sidebar — Mover "Config. IA" e "Empresa" para dentro de Configurações

**O que muda:** Remover "Config. IA" e "Empresa" do menu lateral principal. Dentro da página Configurações, adicionar cards de navegação para "Empresa" e "Config. IA" (já existe card para IA, adicionar para Empresa).

**Arquivos:**
- `src/components/AppSidebar.tsx` — remover itens "Config. IA" e "Empresa" do array `mainItems`
- `src/pages/Configuracoes.tsx` — adicionar card de navegação para "Empresa" na seção "Outras Configurações"

---

## 2. Função de Limpeza de Dados

**O que muda:** Na página Configurações, adicionar uma seção "Limpeza de Dados" com botões para limpar:
- Conversas + Mensagens
- Contatos
- Mídia (bucket `chat-media`)

Cada botão abre um AlertDialog de confirmação com texto de aviso. Ao confirmar, executa DELETE nas tabelas correspondentes filtrado por `tenant_id`.

**Arquivos:**
- `src/pages/Configuracoes.tsx` — adicionar seção de limpeza com 3 botões e dialogs de confirmação

**Lógica de limpeza (por botão):**
- **Conversas:** deleta `mensagens`, `fluxo_sessoes`, `conversas` do tenant
- **Contatos:** deleta `contatos` do tenant (cascade limpa compras, giftback)
- **Mídia:** lista e remove arquivos do bucket `chat-media` com prefixo do tenant

---

## 3. Multi-Empresa (criar/gerenciar múltiplas empresas)

**O que muda:** Hoje o usuário admin vê apenas sua empresa. Permitir que admin_master possa criar novas empresas e alternar entre elas.

**Banco de dados:**
- Nova tabela `user_tenants` (junction): `user_id`, `tenant_id`, `role` — permite um usuário pertencer a múltiplos tenants
- Migration para popular `user_tenants` com dados existentes de `profiles` (cada profile.tenant_id vira um registro)

```sql
CREATE TABLE public.user_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

-- Popular com dados existentes
INSERT INTO public.user_tenants (user_id, tenant_id)
SELECT id, tenant_id FROM public.profiles WHERE tenant_id IS NOT NULL;

-- RLS
ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_tenants" ON public.user_tenants
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "admin_manage_user_tenants" ON public.user_tenants
FOR ALL USING (
  has_role(auth.uid(), 'admin_master') OR
  (user_id = auth.uid())
);
```

**Frontend:**
- `src/pages/Empresa.tsx` — adicionar aba "Empresas" (visível para admin) com lista de tenants do usuário, botão "Nova Empresa", e seletor para alternar empresa ativa
- `src/contexts/AuthContext.tsx` — adicionar `tenants[]` (lista de empresas do usuário), `switchTenant(tenantId)` que atualiza `profiles.tenant_id` e recarrega dados
- `src/components/AppSidebar.tsx` — adicionar seletor de empresa no topo do sidebar (quando usuário tem mais de uma empresa)

---

## 4. Usuário vinculado a múltiplas empresas

Coberto pela tabela `user_tenants` do item 3. O `profiles.tenant_id` continua existindo como "empresa ativa atual". A tabela `user_tenants` registra todas as empresas às quais o usuário pertence.

**Fluxo:**
1. Usuário faz login → carrega `user_tenants` → `profiles.tenant_id` determina empresa ativa
2. Seletor no sidebar permite trocar empresa → atualiza `profiles.tenant_id` → recarrega perfil
3. Convidar membro para empresa → insere em `user_tenants` + atualiza `profiles.tenant_id` se for primeiro tenant

**Ajuste no `handle_new_user`:** Quando aceita convite, além de setar `profiles.tenant_id`, inserir em `user_tenants`.

---

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/components/AppSidebar.tsx` | Remover itens; adicionar seletor de empresa |
| `src/pages/Configuracoes.tsx` | Card empresa; seção limpeza de dados |
| `src/pages/Empresa.tsx` | Aba multi-empresa com criação/listagem |
| `src/contexts/AuthContext.tsx` | `tenants[]`, `switchTenant()` |
| Migration SQL | Tabela `user_tenants`, popular dados, RLS |
| `handle_new_user` function | Inserir em `user_tenants` ao criar/aceitar convite |

