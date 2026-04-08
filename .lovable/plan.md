

# Fix: Cadastro de Contato — Erro de RLS (tenant_id nulo)

## Problema
O usuário cadastrou conta mas o `tenant_id` no perfil está NULL. A política RLS do `contatos` exige que `tenant_id` do registro bata com o do perfil — como ambos são NULL, a comparação falha (NULL != NULL em SQL).

## Causa Raiz
O trigger `handle_new_user` cria o perfil mas não cria um tenant nem associa o usuário a um. Não existe fluxo de criação de tenant no signup.

## Solução

### 1. Migration: Atualizar trigger `handle_new_user`
- Ao criar o perfil, o trigger também cria automaticamente um novo tenant (com nome baseado no email do usuário)
- Associa o `tenant_id` do novo tenant ao perfil
- Atribui a role `admin_tenant` ao novo usuário

### 2. Migration: Corrigir usuário existente
- Criar um tenant para o usuário atual (marcoarruda0@gmail.com) que já está com `tenant_id` NULL
- Atualizar o perfil com o `tenant_id` correto
- Inserir role `admin_tenant` para esse usuário

### 3. Atualizar página de Login/Signup
- Adicionar campo opcional "Nome da empresa" no formulário de cadastro
- Passar o nome da empresa como metadata para o trigger usar

## Detalhes técnicos
- O trigger `handle_new_user` será alterado para: criar tenant → setar `tenant_id` no perfil → inserir role
- A função será `SECURITY DEFINER` para ter permissão de inserir em todas as tabelas
- O nome do tenant virá de `raw_user_meta_data->>'empresa'` ou fallback para o email

