# IA Copiloto — Rascunho de Resposta + Análise de Conversas

Estratégia em 3 camadas para evoluir a IA atual (que só responde automático) em uma ferramenta de produtividade do atendente, com ciclo de aprendizado humano.

---

## Conceito

**Hoje**: IA responde sozinha (ou nada). Tudo ou nada.
**Proposta**: Adicionar um **modo intermediário de copiloto** + uma ferramenta de **análise/varredura** das conversas reais para o admin refinar o prompt da IA antes de liberar respostas automáticas.

```
[Cliente envia msg] → [IA gera RASCUNHO no campo] → [Atendente edita/envia/descarta]
                                                          ↓
[Admin abre "Análise de conversas"] ← [IA varre histórico, gera resumo + sugestões]
                                                          ↓
                                          [Admin ajusta "Instruções extras" da IA]
```

---

## Parte 1 — Banco de dados

### 1.1 Estender `ia_config`
Novas colunas no tenant (admin liga/desliga global, conforme escolhido):
- `copiloto_ativo` (boolean, default `false`) — liga o modo rascunho
- `copiloto_canais` (text[], default `{whatsapp_zapi,whatsapp_cloud}`) — fica preparado, mas hoje vale para ambos
- `ultima_analise_em` (timestamptz, nullable) — quando rodou a última varredura
- `ultima_analise_resumo` (text, nullable) — markdown gerado pela IA na última análise

### 1.2 Nova tabela `ia_rascunhos`
Guarda cada rascunho gerado (tanto para evitar regerar desnecessariamente quanto para métricas futuras).
```sql
CREATE TABLE public.ia_rascunhos (
  id uuid PK,
  tenant_id uuid NOT NULL,
  conversa_id uuid NOT NULL,
  atendente_id uuid NOT NULL,        -- quem viu o rascunho
  conteudo_sugerido text NOT NULL,
  conteudo_enviado text,             -- o que de fato foi enviado (null se descartado)
  status text NOT NULL,              -- 'pendente' | 'enviado_sem_edicao' | 'enviado_com_edicao' | 'descartado'
  baseado_em_mensagem_id uuid,       -- última msg do contato no momento da geração
  fontes jsonb,                      -- títulos dos artigos da base usados
  created_at, updated_at
);
```
RLS: só vê quem é do mesmo tenant; insert/update por usuário do tenant.

### 1.3 Nova tabela `ia_analises_conversas`
Histórico das varreduras (admin pode ver evoluções).
```sql
CREATE TABLE public.ia_analises_conversas (
  id uuid PK,
  tenant_id uuid NOT NULL,
  iniciado_por uuid,                 -- admin que disparou
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  total_conversas int,
  total_mensagens int,
  resumo_markdown text,              -- output da IA: temas, dúvidas frequentes, gaps na base
  sugestoes_instrucoes text,         -- texto que admin pode "Aplicar" direto no campo instrucoes_extras
  status text,                       -- 'rodando' | 'concluido' | 'erro'
  erro_mensagem text,
  created_at, concluido_em
);
```
RLS: apenas admin_tenant/admin_master do tenant.

---

## Parte 2 — Edge functions

### 2.1 Nova: `ia-gerar-rascunho`
Chamada do front quando o atendente puxa a conversa **OU** clica no botão "✨ Sugerir resposta".

Fluxo:
1. Valida JWT + carrega `ia_config` do tenant; se `copiloto_ativo = false` → 200 com `{ skip: true }`.
2. Carrega últimas ~15 mensagens da conversa (contexto curto, economiza créditos).
3. Carrega artigos ativos da `conhecimento_base` (mesma lógica do `ai-responder`).
4. Monta prompt: persona da IA + instruções extras + base + histórico → pede **uma única resposta curta** que o atendente possa enviar como está.
5. Salva em `ia_rascunhos` com `status='pendente'` e retorna `{ id, conteudo, fontes }`.
6. Se já existe rascunho `pendente` para a mesma `conversa_id` baseado na mesma mensagem → reutiliza (não gasta crédito).

Modelo: `google/gemini-3-flash-preview` (rápido, barato).

### 2.2 Nova: `ia-analisar-conversas`
Chamada do front (apenas admin) com `{ periodo_inicio, periodo_fim }`.

Fluxo:
1. Valida JWT + role admin.
2. Cria registro em `ia_analises_conversas` com `status='rodando'`.
3. Busca conversas encerradas no período, com mensagens.
4. Compacta para texto (limita ~200 conversas / ~2000 mensagens para não estourar contexto — escolhe as mais recentes/longas).
5. Chama Lovable AI (modelo `google/gemini-2.5-pro` para qualidade) pedindo **estrutura via tool calling**:
   - `temas_recorrentes`: top 10 assuntos
   - `duvidas_frequentes`: top 10 perguntas
   - `gaps_base_conhecimento`: o que a IA não sabia responder
   - `padroes_atendente`: tom/estilo que os atendentes humanos usaram
   - `sugestoes_instrucoes`: texto pronto para colar no `instrucoes_extras` da IA
   - `resumo_markdown`: documento legível para o admin
6. Atualiza `ia_analises_conversas` com `status='concluido'` + atualiza `ia_config.ultima_analise_*`.
7. Retorna resultado.

Tratamento 429/402 padrão (toast no front).

### 2.3 Atualizar: `ai-responder`
Pequeno ajuste — só responde automaticamente se `ativo=true` **E** `copiloto_ativo=false`. Quando copiloto está ligado, a resposta automática fica suspensa (a IA "vira" copiloto, não autônoma). Isso evita conflito (atendente assume + IA também responde).

---

## Parte 3 — Frontend

### 3.1 `IAConfig.tsx` — nova seção "🤝 Modo Copiloto"
- Switch **"Ativar IA como copiloto do atendente"** (mostra aviso: ao ativar, resposta automática é desligada).
- Texto explicativo: "A IA gera um rascunho de resposta no campo de digitação quando você puxa uma conversa. Você revisa, ajusta e envia."
- Subseção "📊 Análise de conversas":
  - Botão **"Analisar últimos 30 dias"** (admin) → chama `ia-analisar-conversas`.
  - Mostra `ultima_analise_em` + resumo em markdown (com `react-markdown`).
  - Bloco de "Sugestões de instruções" com botão **"Aplicar nas instruções da IA"** que copia para o campo `instrucoes_extras`.
  - Histórico (últimas 5 análises) em accordion.

### 3.2 `ChatInput.tsx` — receber prop `rascunho`
- Nova prop opcional: `rascunho?: { id: string; conteudo: string }` + `onDescartarRascunho?: () => void`.
- Quando vem rascunho:
  - Pré-preenche o `text` automaticamente.
  - Mostra **badge "✨ Rascunho da IA"** acima do textarea.
  - Mostra **ícone 🗑️ "Descartar rascunho"** ao lado do botão de enviar (chama `onDescartarRascunho` → marca status `descartado` no banco e limpa o campo).
- Ao enviar: detecta se o conteúdo final é igual ao rascunho original (`enviado_sem_edicao`) ou foi modificado (`enviado_com_edicao`) e atualiza o registro em `ia_rascunhos`.

### 3.3 `Conversas.tsx` (e/ou `ChatPanel.tsx`)
- Quando o atendente puxa a conversa (`onPull`) **e** `copiloto_ativo=true`:
  - Chama `ia-gerar-rascunho` em background.
  - Passa o resultado para `ChatPanel` → `ChatInput`.
- Botão **"✨ Sugerir resposta"** dentro do `ChatInput` (ao lado dos atalhos), visível só se copiloto ativo:
  - Regenera rascunho on-demand (mesmo endpoint).
  - Útil quando cliente manda nova msg ou atendente quer outra opção.
- Carrega `ia_config.copiloto_ativo` uma vez no contexto da página.

### 3.4 Métricas embutidas (simples, sem nova página)
Na seção "Modo Copiloto" do `IAConfig.tsx`, mostrar 3 cards:
- % rascunhos enviados sem edição (últimos 30d)
- % com edição
- % descartados
Ajuda o admin a sentir se a IA está calibrada (taxa de aceite alta = pronta para automático).

---

## Parte 4 — Custos e segurança

- **Créditos**: rascunho usa modelo `flash` (barato); análise usa `pro` mas só quando admin clica. Estimativa: ~1 chamada flash por conversa puxada.
- **Privacidade**: análise só roda dentro do tenant; nenhum dado sai do escopo.
- **RLS** em todas as novas tabelas, isolamento por `tenant_id`.
- **Rate limit**: tratamento 429/402 com toast amigável já no padrão do `ai-responder`.

---

## Arquivos afetados

**Migrações novas:**
- `supabase/migrations/<timestamp>_ia_copiloto.sql` — colunas em `ia_config`, tabelas `ia_rascunhos` e `ia_analises_conversas`, RLS.

**Edge functions novas:**
- `supabase/functions/ia-gerar-rascunho/index.ts`
- `supabase/functions/ia-analisar-conversas/index.ts`

**Edge function modificada:**
- `supabase/functions/ai-responder/index.ts` — desabilita auto quando copiloto ligado.

**Front modificado:**
- `src/pages/IAConfig.tsx` — seção Copiloto + Análise + métricas.
- `src/components/conversas/ChatInput.tsx` — suporte a rascunho + botão descartar + botão sugerir.
- `src/components/conversas/ChatPanel.tsx` — passar props de rascunho.
- `src/pages/Conversas.tsx` — disparar `ia-gerar-rascunho` no `onPull` e gerenciar estado do rascunho ativo.

---

## Pergunta opcional (sigo com o default se você não responder)

Sobre **quando o rascunho vira "obsoleto"**: se o cliente manda nova mensagem **depois** que o rascunho foi gerado mas antes do atendente enviar, eu:
- (a) **Default**: deixo o rascunho atual como está, mas mostro um aviso amarelo "Nova mensagem do cliente — clique em ✨ para regenerar". (Atendente decide.)
- (b) Regenero automaticamente sobrescrevendo o rascunho. (Pode irritar se o atendente já estava editando.)
