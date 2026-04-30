## Problema

Erro `new row violates row-level security policy for table "tenants"` ao criar empresa em `/empresas`.

### Causa raiz

A política RLS de INSERT da tabela `tenants` exige que o usuário tenha role `admin_master` **OU** `admin_tenant`:

```
admins_can_create_tenants  | INSERT  | WITH CHECK (
  has_role(auth.uid(), 'admin_master') OR has_role(auth.uid(), 'admin_tenant')
)
```

Verifiquei o banco: **só existe 1 registro em `user_roles`** (seu usuário, com `admin_tenant`). Ou seja, a política deveria permitir o seu insert.

Porém, há um problema secundário na sequência de criação em `src/pages/Empresa.tsx` (linhas 858-883): após criar o tenant, o código tenta inserir em `user_tenants`, mas **não copia as roles do usuário para o novo tenant**. Como o seu role `admin_tenant` está vinculado ao tenant atual via `profiles.tenant_id`, ao trocar de tenant você perde permissões. Isso pode estar gerando o erro em casos específicos (ex.: usuário sem role efetiva quando o `profile.tenant_id` foi resetado).

Mais importante: precisamos **garantir** que admins consigam criar empresas e que o criador receba automaticamente o role `admin_tenant` no novo tenant.

## Plano de correção

### 1. Validar pré-condição no front (UX)
Em `src/pages/Empresa.tsx` (botão "Nova Empresa") e `src/components/TenantSwitcherHeader.tsx` (item "Nova empresa"):
- Antes de chamar o insert, checar `hasRole("admin_tenant") || hasRole("admin_master")`. Se falso, exibir toast claro: "Apenas administradores podem criar novas empresas".

### 2. Centralizar criação numa Edge Function `criar-tenant`
Mover o fluxo de criação para uma edge function com `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS), que executa atomicamente:

```text
1. Verifica JWT do chamador → obtém user_id
2. Verifica que o user tem role admin_tenant OU admin_master
3. INSERT em tenants (nome)
4. INSERT em user_tenants (user_id, tenant_id)
5. INSERT em user_roles (user_id, role='admin_tenant') para o NOVO tenant
   (se o schema permitir role por tenant; senão garante o role global)
6. UPDATE profiles SET tenant_id = novo_tenant_id WHERE id = user_id
   (opcional — fazer "switch" automático)
7. Retorna { tenant_id, nome }
```

Vantagens:
- Elimina race condition entre os 2 inserts atuais.
- Garante que o criador sempre tem `admin_tenant` no novo tenant.
- Mensagens de erro coerentes vindas do backend.

### 3. Atualizar front para chamar a função
Substituir os blocos de `supabase.from("tenants").insert(...)` em:
- `src/pages/Empresa.tsx` (linhas 858-883)
- `src/components/TenantSwitcherHeader.tsx` (linhas 38-58)

por:
```ts
const { data, error } = await supabase.functions.invoke("criar-tenant", {
  body: { nome: newTenantName.trim() }
});
```

Após sucesso: mostrar toast, fechar dialog e recarregar (ou trocar para o novo tenant).

### 4. Manter política RLS atual
A política `admins_can_create_tenants` continua válida como defesa em profundidade. A edge function usa service role, então não depende dela, mas se algum dia a função cair, a política ainda bloqueia inserts indevidos.

### 5. Diagnóstico inicial (executado já no início)
Antes de implementar, vou confirmar via query qual o `auth.uid()` retornado e qual `tenant_id` está atualmente no `profile` do usuário, para descartar que o erro venha de sessão expirada / profile sem tenant.

## Detalhes técnicos

**Arquivos a modificar:**
- `supabase/functions/criar-tenant/index.ts` (novo)
- `supabase/config.toml` (registrar função com `verify_jwt = true`)
- `src/pages/Empresa.tsx` (botão criar empresa)
- `src/components/TenantSwitcherHeader.tsx` (item nova empresa)

**Permissões verificadas:**
- `admins_can_create_tenants` → INSERT permitido para `admin_master` / `admin_tenant` ✓
- Service role bypassa RLS para garantir atomicidade ✓

## Resultado esperado

Ao clicar em "Nova Empresa" como admin:
1. Empresa é criada com sucesso
2. Você é vinculado a ela em `user_tenants`
3. Você recebe role `admin_tenant` na nova empresa
4. (Opcional) Troca automática para a nova empresa
5. Recarrega a página mostrando a empresa criada na lista
