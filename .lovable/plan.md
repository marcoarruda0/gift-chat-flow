## Objetivo

Quando o admin adicionar um e-mail em **Configurações → Equipe**, o sistema deve disparar **automaticamente** um e-mail para a pessoa convidada com o link de cadastro — sem o admin precisar copiar/colar nada.

## Como vai ficar o fluxo

1. Admin abre **Configurações → Equipe → Convidar membro**, digita e-mail + escolhe a função (admin_tenant / atendente / caixa).
2. Sistema:
   - Cria o convite na tabela `convites` (já funciona hoje).
   - **Envia automaticamente** um e-mail para a pessoa com:
     - Nome da empresa que está convidando
     - Nome de quem convidou
     - Função que receberá
     - Botão "Aceitar convite" → link `https://prbot.online/login?convite=TOKEN`
     - Validade do convite
3. A pessoa clica no link, cai na tela de Login já em modo "Criar Conta" com e-mail pré-preenchido, define a própria senha e entra direto na empresa correta com a role correta (trigger `handle_new_user` já cuida disso).
4. Na lista de convites pendentes, mostrar status "E-mail enviado" + botão "Reenviar e-mail" (além do "Copiar link" que já existe como fallback).

## O que vai ser construído

### 1. Infraestrutura de e-mail (Lovable Emails)
- Configurar domínio de envio (o atual `notify.pecarara.notifica` parece de teste — vou pedir para você confirmar/trocar antes de seguir).
- Subir infraestrutura de e-mails transacionais (fila, suppression list, etc.) — feito automaticamente pelas tools.

### 2. Template de e-mail "Convite para equipe"
React Email com a identidade visual do PR Bot (cor primária `#1B4F72`, fonte Inter), com:
- Saudação personalizada
- Bloco com nome da empresa, quem convidou e função
- Botão CTA azul "Aceitar convite e criar minha conta"
- Texto de fallback com o link
- Aviso de validade

### 3. Edge Function `send-transactional-email`
Já vem pronta da scaffold. Vai ser invocada com `templateName: 'convite-equipe'` e os dados do convite.

### 4. Ajuste em `src/pages/Empresa.tsx`
- Após `INSERT` no `convites`, chamar `supabase.functions.invoke('send-transactional-email', ...)` passando: e-mail, nome da empresa, nome do convidador, role, link com token.
- Toast: "Convite enviado por e-mail!" (em vez de "Convite criado!").
- Botão "Reenviar e-mail" em cada convite pendente da lista.
- Manter botão "Copiar link" como backup.

### 5. Tratamento de falha
Se o envio do e-mail falhar (domínio não verificado, e-mail inválido, etc.), o convite **continua sendo criado** (link manual ainda funciona) e o admin recebe um aviso "Convite criado, mas não foi possível enviar o e-mail — copie o link manualmente".

## Detalhes técnicos

- E-mail é **transacional** (1:1, disparado pela ação do admin) → permitido pelas regras do Lovable Emails.
- `idempotencyKey`: `convite-${convite.id}` (evita envio duplicado em retries).
- Não mexe na tabela `convites` nem no trigger `handle_new_user` — o fluxo de aceite continua igual.
- Não toca no `Login.tsx` — ele já trata `?convite=TOKEN` corretamente.

## Pergunta antes de implementar

O domínio atual de e-mail está como `notify.pecarara.notifica` (de teste, DNS pendente). Para os e-mails realmente chegarem na caixa de entrada das pessoas, precisamos de um **domínio real verificado** (ex: `notify.prbot.online`).

**Você quer que eu:**
- (a) Configure agora o domínio `notify.prbot.online` (você precisará adicionar uns registros DNS no provedor do domínio prbot.online), **ou**
- (b) Implemente o envio mesmo assim usando o domínio que está aí — funcionará para teste interno mas pode cair em spam / não chegar.

Me diz qual opção e eu sigo.
