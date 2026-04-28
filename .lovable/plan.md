
# Plano de Implementação — Agendamento + LGPD + Timeline

Três entregas independentes, podem ser feitas na mesma onda.

---

## 1) Agendamento de Campanhas (cron)

**Estado atual:** o campo `campanhas.agendada_para` já existe e a UI em `Campanhas.tsx` já permite escolher data/hora ao criar. O que falta: um worker que dispara as campanhas quando chega a hora.

**O que faremos:**

1. **Migration** — adicionar índice em `(status, agendada_para)` para varredura eficiente. Adicionar status `agendada` no enum `campanha_status` (se ainda não existir; senão usar `rascunho` + flag).
2. **Nova edge function `processar-campanhas-agendadas`**
   - Roda a cada 5 minutos.
   - Busca campanhas com `status='agendada'` e `agendada_para <= now()`.
   - Para cada uma: marca status `enviando` e invoca `enviar-campanha` ou `enviar-campanha-cloud` conforme `canal`.
   - Logs estruturados (qtd processada, erros).
3. **Cron job (pg_cron + pg_net)** — agendar a função a cada 5 min via `cron.schedule` (registrado como dado, não migration).
4. **UI em Campanhas.tsx**
   - Ao salvar com data futura → `status='agendada'` (hoje vai como rascunho).
   - Badge "Agendada para 28/04 14:30" na lista.
   - Botão "Cancelar agendamento" (volta para rascunho).
   - Coluna ordenável por `agendada_para` quando filtro = agendadas.

**Arquivos:** 1 migration, 1 nova edge function, edição em `src/pages/Campanhas.tsx`, registro do cron.

---

## 2) Opt-out / LGPD

**O que faremos:**

1. **Migration**
   - Adicionar `contatos.opt_out_whatsapp boolean default false` e `contatos.opt_out_at timestamptz`.
   - Criar tabela `optout_tokens` (`id, tenant_id, contato_id, token uuid unique, created_at, used_at`) — token público de uso único para o link de descadastro.
   - RLS: SELECT por tenant; INSERT por tenant; UPDATE público restrito apenas via edge function (com service role).

2. **Nova edge function `optout-publica`** (verify_jwt = false)
   - `GET /optout-publica?token=...` → renderiza HTML simples ("Confirmar descadastro do WhatsApp da Loja X" + botão).
   - `POST` confirma → marca `contatos.opt_out_whatsapp=true`, `opt_out_at=now()`, registra `optout_tokens.used_at`.
   - Página de sucesso amigável (PT-BR, branding da loja a partir de `tenants.nome`).

3. **Geração do link no envio**
   - Em `enviar-campanha-cloud` (e `enviar-campanha` Z-API): antes de cada envio, fazer upsert de `optout_tokens` para aquele contato e gerar URL `https://<projeto>.functions.supabase.co/optout-publica?token=...`.
   - Nova variável de template `{{opt_out_url}}` disponível em `template_variaveis`.
   - Ao montar o mapping no `montarComponentsTemplate`, expor essa variável (ou anexar como sufixo opcional ao body em campanhas Z-API texto livre).

4. **Filtro automático no envio**
   - Em `enviar-campanha*`: quando montar a lista de destinatários, excluir `WHERE opt_out_whatsapp = false`.
   - Em `processar-comunicacoes-giftback`: mesma exclusão.
   - Marcar destinatário como `status='optout'` (novo enum) quando excluído por essa razão (auditável).

5. **UI**
   - Campanhas: aviso ao criar, contador "X contatos opted-out serão pulados".
   - Contato individual: badge "Descadastrado" + botão "Reativar opt-in" (admin).
   - Página dedicada **Configurações → LGPD**: exportar CSV de opted-out, política de privacidade configurável, link manual para gerar opt-out de um contato.
   - Variável `{{opt_out_url}}` aparece no `InsertVariableButton` ao editar campanha.

**Arquivos:** 1 migration, 1 nova edge function pública, edições em `enviar-campanha`, `enviar-campanha-cloud`, `processar-comunicacoes-giftback`, `src/pages/Campanhas.tsx`, `src/pages/Contatos.tsx`, nova aba em `Configuracoes.tsx`, atualizar `giftback-comunicacao.ts` (variável).

---

## 3) Timeline Unificada do Contato

**O que faremos:**

1. **Função SQL `contato_timeline(p_contato_id uuid, p_limit int)` (security definer, RLS via tenant)** — retorna jsonb ordenado desc com eventos unidos:
   - Compras (`compras`) → tipo `compra`
   - Giftback movimentos (`giftback_movimentos`) → tipo `giftback_credito` / `giftback_debito` / `giftback_expirado`
   - Mensagens trocadas (`mensagens` via `conversas`) → tipo `mensagem` (resumo: primeira/última do dia)
   - Campanhas recebidas (`campanha_destinatarios` enviado) → tipo `campanha`
   - Comunicações giftback (`giftback_comunicacao_log`) → tipo `comunicacao_giftback`

   Cada item: `{ ts, tipo, titulo, descricao, valor, ref_id, metadata }`.

2. **Novo componente `ContatoDrawer.tsx`** ou nova página `/contatos/:id`
   - Header: nome, telefone, tags, RFV badge, saldo giftback, status opt-in/out.
   - Tabs: **Visão Geral** | **Timeline** | **Compras** | **Giftback** | **Mensagens** | **Campos**.
   - Tab Timeline: lista vertical estilo feed, ícone por tipo, agrupada por dia ("Hoje", "Ontem", "27/04/2026"), filtro por tipo (chips).
   - Botão "Iniciar conversa" abre o módulo Conversas.

3. **Integração**
   - Em `Contatos.tsx`: clicar na linha abre o drawer/página.
   - Em `Conversas.tsx`: botão "Ver perfil" na barra do chat abre o mesmo drawer.

**Arquivos:** 1 migration (função SQL), novo `src/components/contatos/ContatoDrawer.tsx` + `Timeline.tsx`, edições em `Contatos.tsx` e `ChatPanel.tsx`.

---

## Ordem sugerida de execução

1. **Migration única** com todas as mudanças de schema (índice campanhas, opt_out, optout_tokens, função timeline). 1 passo, baixo risco.
2. **Edge function `optout-publica`** + edições nos enviadores para respeitar opt-out. (LGPD não pode esperar.)
3. **Edge function `processar-campanhas-agendadas`** + cron + UI de agendamento.
4. **Drawer/Timeline do contato** + integrações de UI.

## Estimativa

- Agendamento: ~2-3h
- LGPD: ~4-5h (mais superfície)
- Timeline: ~3-4h

Total: meio dia de implementação. Posso executar tudo numa única passada.

**Posso seguir?**
