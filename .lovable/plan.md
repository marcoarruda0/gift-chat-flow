## Objetivo

Manter o fluxo **manual sem e-mail**, mas tornar o link de convite **óbvio e fácil de compartilhar** logo após criar — em vez de depender do botão pequeno de "copiar" perdido na lista.

## Como vai ficar o fluxo

1. Admin abre **Configurações → Equipe → Convidar membro**, digita e-mail + escolhe a função.
2. Ao clicar em "Convidar", **o dialog não fecha** — ele se transforma numa tela de "Convite criado!" mostrando:
   - ✅ Mensagem de sucesso
   - 📋 **Caixa grande com o link pronto** (clicar = copia)
   - 💬 **Botão "Compartilhar no WhatsApp"** com mensagem pré-formatada (`https://wa.me/?text=...`)
   - 📨 **Botão "Compartilhar por e-mail"** (`mailto:` com assunto/corpo prontos)
   - 📋 Botão "Copiar link"
   - Aviso: "Validade: X dias"
   - Botão "Fechar"
3. Na lista de **Convites Pendentes**, melhorar a UX:
   - Botão "Compartilhar" mais visível (ícone + texto), abre um popover com as 3 opções (copiar / WhatsApp / e-mail)
   - Mantém o "Excluir convite"
4. A pessoa recebe o link, clica → cai no Login em modo "Criar Conta" com e-mail pré-preenchido → define senha → entra direto na empresa com a role correta. (Já funciona, sem alterações.)

## O que vai ser construído

### 1. Ajustes em `src/pages/Empresa.tsx`

**Dialog de convite (atual ~linha 780):**
- Adicionar estado `inviteResult` com `{ token, email, role }` após criação bem-sucedida.
- Quando `inviteResult` existe, trocar o conteúdo do dialog para o painel "Convite criado!" com link + botões de compartilhar.
- Resetar tudo ao fechar.

**Mensagem pré-formatada de WhatsApp:**
```
Olá! Você foi convidado para participar da equipe da {EMPRESA} no PR Bot.
Acesse o link abaixo para criar sua conta:
{LINK}
```

**Mensagem pré-formatada de e-mail (mailto):**
- Assunto: `Convite para a equipe da {EMPRESA}`
- Corpo: mesmo texto acima

**Lista de Convites Pendentes (linhas 502-542):**
- Trocar o botão de copiar por um botão "Compartilhar" com `Popover` mostrando as 3 opções.

### 2. Pequenos componentes auxiliares
- Função utilitária `buildShareMessage(empresa, link)` no próprio arquivo (não justifica componente separado).
- Usa `Popover` do shadcn (já existe no projeto).

## O que NÃO muda

- Tabela `convites`, trigger `handle_new_user`, página `Login.tsx` → tudo igual.
- Nenhuma edge function nova.
- Nenhuma configuração de e-mail / domínio.
- O link gerado continua sendo `https://prbot.online/login?convite=TOKEN`.

## Resumo do impacto

- **1 arquivo alterado**: `src/pages/Empresa.tsx`
- **0 migrations**
- **0 edge functions**
- **0 dependências novas**

Simples, rápido, e o admin consegue compartilhar o convite em 2 cliques pelo canal que preferir.
