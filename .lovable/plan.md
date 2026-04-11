

# Módulo Disparos — Campanhas em Massa via WhatsApp

## Objetivo
Permitir que o tenant crie campanhas de mensagens em massa para contatos selecionados (por tags, filtros ou seleção manual), com agendamento, controle de status, e relatório de envio.

## Arquitetura

```text
┌─────────────────────────────────────────┐
│  UI: /disparos                          │
│  Lista campanhas + botão Nova Campanha  │
│  Dialog: nome, mensagem, filtro contatos│
│  Agendamento (agora ou data/hora)       │
└──────────────┬──────────────────────────┘
               │ insert campanha + destinatários
               ▼
┌─────────────────────────────────────────┐
│  DB: campanhas + campanha_destinatarios │
│  status: rascunho → enviando → concluída│
└──────────────┬──────────────────────────┘
               │ Edge Function dispara
               ▼
┌─────────────────────────────────────────┐
│  Edge: enviar-campanha                  │
│  Loop destinatários, envia via Z-API    │
│  Delay entre msgs (anti-ban)            │
│  Atualiza status de cada destinatário   │
└─────────────────────────────────────────┘
```

## Alterações

### 1. Migration — Tabelas `campanhas` e `campanha_destinatarios`

**`campanhas`**: `id`, `tenant_id`, `nome`, `mensagem` (text), `tipo_filtro` (todos/tag/manual), `filtro_valor` (text[]), `status` (rascunho/agendada/enviando/concluida/cancelada), `agendada_para` (timestamptz nullable), `total_destinatarios` (int), `total_enviados` (int default 0), `total_falhas` (int default 0), `criado_por` (uuid), `created_at`, `updated_at`.

**`campanha_destinatarios`**: `id`, `campanha_id`, `contato_id`, `telefone`, `status` (pendente/enviado/falha), `enviado_at`, `erro` (text nullable).

RLS: isolamento por `tenant_id`, admin_tenant e admin_master para INSERT/UPDATE/DELETE.

### 2. Página `src/pages/Disparos.tsx`
- Lista de campanhas com colunas: nome, status (badge colorido), destinatários, enviados/falhas, data
- Botão "Nova Campanha" abre dialog/drawer com:
  - Nome da campanha
  - Mensagem (textarea com preview, suporte a variáveis `{nome}`, `{telefone}`)
  - Filtro de contatos: todos, por tag (multi-select das tags existentes), ou seleção manual
  - Preview da quantidade de contatos que serão atingidos
  - Agendamento: enviar agora ou agendar data/hora
- Ações: Enviar/Agendar, Cancelar campanha em andamento
- Detalhes da campanha: lista de destinatários com status individual

### 3. Edge Function `enviar-campanha/index.ts`
- Recebe `campanha_id`
- Busca campanha e destinatários pendentes
- Para cada destinatário:
  - Substitui variáveis `{nome}` na mensagem
  - Envia via Z-API (mesma lógica do webhook)
  - Atualiza status do destinatário (enviado/falha)
  - Delay de 1-2s entre mensagens (anti-ban WhatsApp)
- Atualiza contadores `total_enviados`/`total_falhas` na campanha
- Marca campanha como `concluida` ao final

### 4. Rota + Sidebar
- Substituir Placeholder por `Disparos` na rota `/disparos`
- Sidebar já tem o link configurado

## Arquivos criados/alterados

| Arquivo | Tipo |
|---------|------|
| Migration (campanhas + destinatários) | Novo |
| `src/pages/Disparos.tsx` | Novo |
| `supabase/functions/enviar-campanha/index.ts` | Novo |
| `src/App.tsx` | Alterado (import Disparos) |

## Detalhes Técnicos

- O delay entre mensagens (1-2s) é crucial para evitar ban do WhatsApp. Para campanhas grandes (>500), considerar delay de 3-5s.
- Variáveis suportadas inicialmente: `{nome}`, `{telefone}` — substituídas com dados do contato.
- O envio usa a mesma Z-API config do tenant (`zapi_config`).
- Campanhas agendadas: a UI mostra status "agendada" e um cron job (ou invocação manual) verifica campanhas com `agendada_para <= now()` e status `agendada` para disparar automaticamente.

