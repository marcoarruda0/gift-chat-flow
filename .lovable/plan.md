# Plano final — Jornada de login + caso Beatriz

## 1. Destravar Beatriz agora

Confirmar manualmente o e-mail dela em `auth.users` para que ela consiga entrar com a senha que já cadastrou.

## 2. Desativar obrigatoriedade de confirmação de e-mail

Configurar `auto_confirm_email = true`. A partir de agora, qualquer pessoa que aceitar um convite e definir senha entra direto, sem precisar confirmar o e-mail. O controle de quem entra continua sendo o convite do admin.

## 3. "Esqueci minha senha" no `Login.tsx`

- Link "Esqueci minha senha?" abaixo do botão Entrar
- Abre um modo dentro do mesmo card (campo de e-mail + botão "Enviar instruções")
- Chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`
- Mostra: "Se este e-mail estiver cadastrado, você receberá instruções em instantes"
- Botão "Voltar para o login"

## 4. Nova página `/reset-password`

- Rota pública (fora do `ProtectedRoute`) em `App.tsx`
- Detecta o evento `PASSWORD_RECOVERY` via `onAuthStateChange`
- Formulário: nova senha + confirmar senha (mín. 6, validação de match)
- Chama `supabase.auth.updateUser({ password })`
- Em sucesso: toast + redirect para `/`

## 5. Mensagens de erro do Login em PT-BR

Mapear no catch:
- `Invalid login credentials` → "E-mail ou senha incorretos"
- `Email not confirmed` → "Confirme seu e-mail antes de entrar" (não deve mais ocorrer após item 2, mas mantemos como fallback)
- `User already registered` → "Este e-mail já está cadastrado. Tente entrar"
- `Email rate limit exceeded` → "Muitas tentativas. Aguarde alguns minutos"
- Genérico → "Não foi possível entrar. Tente novamente ou use 'Esqueci minha senha'"

## 6. Coluna "Status" + botão "Reenviar instruções" na lista de membros

Em `src/pages/Empresa.tsx`, na tabela de Membros:

- Nova coluna **Status** com badge:
  - Verde "Ativo" → já fez login pelo menos uma vez (`last_sign_in_at` não nulo)
  - Amarelo "Nunca acessou" → conta criada mas sem login ainda
  - (Não vai mais existir "Não confirmou" depois do item 2, mas mostramos "Nunca acessou" para o admin saber quem ainda não entrou)
- Botão **"Reenviar acesso"** ao lado do nome quando status = "Nunca acessou":
  - Abre popover com 3 opções: copiar link / WhatsApp / e-mail
  - Link enviado é um **link de redefinição de senha** (`resetPasswordForEmail`) — funciona para quem esqueceu a senha E para quem nunca configurou. O link leva para `/reset-password`.
  - Mensagem pré-formatada igual ao convite, ex: *"Olá! Use o link abaixo para acessar sua conta no PR Bot: {LINK}"*

### Como buscar o status sem expor `auth.users`

Criar uma RPC `security definer` chamada `listar_membros_tenant()` que retorna, para o tenant do `auth.uid()`:
```
id, nome, email, role, last_sign_in_at, created_at, departamento_id
```
Substituir o fetch atual de membros por essa RPC. Garante que admin_tenant veja `last_sign_in_at` dos membros sem dar acesso direto a `auth.users`.

### Como gerar o link de reset sem o admin precisar logar como o membro

O `supabase.auth.resetPasswordForEmail()` no client funciona para qualquer e-mail e dispara o e-mail oficial — mas como queremos **link manual para compartilhar** (sem depender de e-mail), criar uma edge function `gerar-link-acesso`:

- Recebe `user_id` do membro
- Valida: caller é admin do mesmo tenant, target não é admin_master
- Usa `adminClient.auth.admin.generateLink({ type: 'recovery', email: targetEmail, options: { redirectTo: 'https://prbot.online/reset-password' } })`
- Retorna `{ action_link, expires_at }` para o frontend exibir/compartilhar

Isso mantém o padrão "link manual, sem setup de e-mail" que você adotou nos convites.

# Detalhes técnicos

**Arquivos novos:**
- `src/pages/ResetPassword.tsx`
- `supabase/functions/gerar-link-acesso/index.ts`

**Arquivos alterados:**
- `src/pages/Login.tsx` — modo "esqueci senha" + mensagens de erro PT-BR
- `src/App.tsx` — rota pública `/reset-password`
- `src/pages/Empresa.tsx` — coluna Status + botão Reenviar acesso (popover) + trocar fetch de membros para a nova RPC

**Migrations:**
- Criar RPC `listar_membros_tenant()` (security definer)

**Data fixes (via insert tool):**
- `UPDATE auth.users SET email_confirmed_at = now() WHERE email = 'beatriz15.ferre@hotmail.com'`

**Configuração de auth:**
- `auto_confirm_email = true`

**Sem mudanças em:** trigger `handle_new_user`, tabela `convites`, edge function `gerenciar-membro`, `AuthContext`.

# Resumo de impacto

- 2 arquivos novos
- 3 arquivos alterados
- 1 migration (RPC)
- 1 edge function nova
- 1 ajuste de config de auth
- 1 fix manual na conta da Beatriz
