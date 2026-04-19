

# Plano: Domínio de e-mail por empresa + Gestão de Empresas + Preview do E-mail

## 1. Domínio de e-mail por empresa (com ressalva técnica)

⚠️ **Limitação importante**: a infraestrutura nativa do Lovable Email permite **um único domínio verificado por projeto**. Não é possível, hoje, ter `notify.empresaA.com` e `notify.empresaB.com` coexistindo no mesmo projeto via Lovable Email.

**Duas opções para resolver isso:**

**Opção A — Lovable Email (1 domínio compartilhado, remetente personalizado por empresa)**
- Configura **um** domínio Lovable (ex: `notify.suaplataforma.com`)
- Por empresa: salvar `email_remetente_nome` (ex: "Empresa A") e `email_remetente_local` (ex: `contato`) em `tenants`
- Resultado: e-mails saem como `Empresa A <contato@notify.suaplataforma.com>`
- ✅ Vantagens: simples, 1 setup só, 100% gerenciável aqui
- ❌ Desvantagens: domínio do remetente é o mesmo para todos

**Opção B — Resend por empresa (multi-domínio real)**
- Cada empresa adiciona sua API key Resend + domínio próprio em `tenants` (`resend_api_key`, `email_dominio`, `email_from`)
- Edge function `enviar-campanha-email` lê config do tenant e usa Resend SDK
- ✅ Vantagens: cada empresa tem seu domínio real (`notify.empresaA.com`)
- ❌ Desvantagens: cada cliente precisa criar conta Resend, verificar DNS na Resend, salvar API key

**Recomendação**: começar com **Opção A** (rápido, atende 90% dos casos) e oferecer **Opção B** como upgrade para empresas que exigem domínio próprio. Vou implementar a Opção A neste plano. Se preferir B, me avise antes de aprovar.

### Implementação Opção A
- Migration: adicionar em `tenants`: `email_remetente_nome` (text), `email_remetente_local` (text, default 'contato'), `email_assinatura` (text, opcional — rodapé HTML por empresa)
- Aba **"E-mail"** nova em `Empresa.tsx` para configurar esses 3 campos por empresa ativa
- Edge function `enviar-campanha-email` (a criar) usa esses campos ao montar o `from` e injeta a assinatura no rodapé do template

## 2. Gestão de Empresas + Filtro no header

**Já existe** infraestrutura: tabela `tenants`, `user_tenants` (relação N:N), aba "Empresas" em `Empresa.tsx` (só admin_master), método `switchTenant` no AuthContext, switcher no sidebar (só aparece se `tenants.length > 1`).

**O que falta:**
1. **Permitir admin_tenant criar empresas** (hoje só admin_master vê a aba). Mover a aba "Empresas" para ficar visível para `admin_tenant` também — qualquer admin pode criar e gerenciar empresas onde participa.
2. **Filtro no header (top-right)**: novo componente `TenantSwitcherHeader` no `AppLayout.tsx` ao lado direito do header. Sempre visível (mesmo com 1 só empresa, mostra o nome). Dropdown lista todas as empresas do usuário + botão "+ Nova empresa" no rodapé do dropdown (abre o mesmo dialog de criar empresa).
3. **Rota dedicada** `/empresas` no sidebar (admin only) que vai direto pra aba Empresas — atalho útil em vez de "Empresa → Empresas".
4. Manter o switcher do sidebar (alguns usuários preferem).

### Mudanças
- `src/components/AppLayout.tsx`: importar e renderizar `<TenantSwitcherHeader />` alinhado à direita no `<header>`
- `src/components/TenantSwitcherHeader.tsx` (novo): dropdown com lista de tenants + "Nova empresa" no rodapé + dialog inline
- `src/pages/Empresa.tsx`: aba "Empresas" passa a aparecer para `admin_tenant` também
- `src/components/AppSidebar.tsx`: novo item "Empresas" (admin only) → `/empresas` (rota nova que renderiza `<Empresa>` com tab default `empresas`)

## 3. Preview do e-mail lado a lado com editor

Hoje `EmailEditor.tsx` mostra só o editor. Vou criar layout split:

```text
┌──────────────────────┬──────────────────────┐
│  Editor (Tiptap)     │  Preview (iframe)    │
│  + toolbar           │  fundo branco        │
│                      │  como caixa de email │
└──────────────────────┴──────────────────────┘
```

- Componente `EmailEditor.tsx` ganha layout `grid grid-cols-1 lg:grid-cols-2 gap-4`
- Coluna direita: `<iframe srcDoc={...} />` com HTML do editor envelopado em wrapper estilo email (max-width 600px, fundo branco, font-family Arial, padding) + assinatura de empresa renderizada no rodapé (puxa de `tenants.email_assinatura`)
- Atualiza em tempo real conforme o usuário digita
- Mostra também o **assunto** e **preview text** no topo da coluna direita (simulando como aparece na inbox: Assunto em negrito, preview cinza embaixo, igual Gmail)
- Em telas estreitas (`<lg`), preview vira aba abaixo do editor (Tabs "Editor | Preview")

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| Migration | `tenants`: +3 colunas (`email_remetente_nome`, `email_remetente_local`, `email_assinatura`) |
| `src/pages/Empresa.tsx` | Nova aba "E-mail" + aba "Empresas" liberada para admin_tenant |
| `src/components/TenantSwitcherHeader.tsx` (novo) | Dropdown no header |
| `src/components/AppLayout.tsx` | Renderiza switcher no header |
| `src/components/AppSidebar.tsx` | Novo item "Empresas" para admin |
| `src/App.tsx` | Rota `/empresas` |
| `src/components/campanhas/EmailEditor.tsx` | Split editor + preview iframe + simulação de inbox |
| `src/pages/Campanhas.tsx` | Passar `tenantSignature` pro EmailEditor (opcional) |

## Pré-requisito

Para Opção A funcionar de verdade (envio real), precisa configurar o domínio de e-mail Lovable do projeto. As mudanças de UI/multi-tenant funcionam sem isso, mas o envio efetivo só destrava após:

<lov-actions>
<lov-open-email-setup>Configurar domínio de e-mail</lov-open-email-setup>
<lov-suggestion message="Teste end-to-end: troque de empresa pelo header, configure remetente em E-mail e crie uma campanha pra ver o preview ao vivo">Verificar fluxo completo</lov-suggestion>
<lov-suggestion message="Quero a Opção B em vez da A: cada empresa cadastra sua própria API key Resend e domínio próprio">Usar Resend por empresa (Opção B)</lov-suggestion>
<lov-suggestion message="Adicionar templates de e-mail prontos (boas-vindas, recuperação de carrinho, aniversário) selecionáveis no editor">Templates de e-mail prontos</lov-suggestion>
<lov-suggestion message="Adicionar variáveis dinâmicas inseríveis com 1 clique no editor (botão 'Inserir variável' que mostra {nome}, {email}, etc.)">Botão de variáveis no editor</lov-suggestion>
</lov-actions>

