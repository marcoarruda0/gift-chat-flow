
# Análise Automática de Satisfação por IA

Quando um atendimento de WhatsApp (Z-API ou Cloud Oficial) é encerrado, uma IA analisa a conversa e classifica objetivamente a satisfação do cliente em uma escala de 5 níveis. Os dados ficam disponíveis em uma nova aba de Relatórios.

## Escopo

- **Canais analisados**: apenas `zapi` e `whatsapp_cloud` (ignora outros)
- **Conversas ignoradas**: aquelas geradas/dominadas por fluxos automáticos ou disparos de campanha (sem interação humana real do atendente)
- **Mensagens consideradas**: do cliente + do atendente humano + sugestões de IA aceitas (rascunhos enviados). Mensagens de fluxo automático e disparo são marcadas como contexto, não pesam na avaliação.
- **Escala**: 5 níveis (`muito_insatisfeito` a `muito_satisfeito`), score 1-5

## O que a IA avalia

Além do conteúdo (sentimento, palavras de elogio/reclamação, resolução do problema), a análise considera **métricas operacionais** calculadas no backend e injetadas no prompt:

- Cliente foi efetivamente respondido (ratio mensagens cliente vs respostas atendente)
- Tempo médio de primeira resposta e tempo entre respostas
- Duração total do atendimento
- Quantidade de mensagens não respondidas no fim
- Se houve transferência entre atendentes
- Se a conversa terminou com cliente perguntando algo sem resposta

A IA combina esses sinais com o conteúdo das mensagens para gerar:
- Classificação (5 níveis) + score (1-5)
- Sentimento geral (positivo/neutro/negativo)
- Justificativa curta
- Pontos positivos e negativos detectados

## Banco de Dados

### Estender `ia_config`
- `satisfacao_ativo` boolean
- `satisfacao_criterios` text — instruções livres do tenant
- `satisfacao_min_mensagens_cliente` int default 2 — ignora conversas muito curtas

### Nova tabela `atendimento_satisfacao`
| Campo | Tipo |
|---|---|
| id, tenant_id, conversa_id (UNIQUE), contato_id, atendente_id, departamento_id | uuid |
| canal | text |
| classificacao | enum 5 níveis |
| score | smallint 1-5 |
| sentimento | enum positivo/neutro/negativo |
| justificativa | text |
| pontos_positivos, pontos_negativos | text[] |
| total_mensagens_cliente, total_mensagens_atendente | int |
| primeiro_resp_segundos, tempo_medio_resposta_segundos | int |
| duracao_segundos | int |
| houve_transferencia | boolean |
| terminou_sem_resposta | boolean |
| status | text (pendente/processando/concluido/erro/ignorado) |
| motivo_ignorado, erro | text |
| created_at, processado_em | timestamptz |

RLS: SELECT por tenant; INSERT/UPDATE só via service role.

### Trigger
`AFTER UPDATE` em `conversas`: quando `atendimento_encerrado_at` passa a NOT NULL e canal ∈ (`zapi`, `whatsapp_cloud`), insere registro `pendente` (idempotente via UNIQUE em conversa_id).

### Índices
- `(tenant_id, created_at DESC)`
- `(status)` para o cron
- `(atendente_id, created_at DESC)` para ranking

## Edge Function `analisar-satisfacao`

Cron a cada 2 min (`pg_cron` + `pg_net`). Para cada `pendente` (lote de 20):

1. Carrega conversa + mensagens ordenadas
2. Filtra: ignora conversas com menos de N mensagens do cliente → marca `ignorado`
3. Calcula métricas operacionais (tempos, contagens, transferências)
4. Monta prompt com: critérios do tenant + métricas + transcrição (mensagens humanas e rascunhos IA enviados marcados; mensagens de fluxo/disparo marcadas como `[automático]`)
5. Chama Lovable AI Gateway com **tool calling estruturado** (`classificar_satisfacao`) — modelo padrão `google/gemini-3-flash-preview`
6. Persiste resultado, marca `concluido`
7. Tratamento 429/402/parse → marca `erro` com mensagem

## UI — Configurações de IA

Nova seção "Análise de Satisfação" em `IAConfig.tsx`:
- Switch ativar/desativar
- Textarea "Critérios de avaliação" com placeholder/exemplo
- Input numérico "Mínimo de mensagens do cliente" (default 2)
- Texto explicativo dos sinais usados (tempo de resposta, etc.)
- Botão "Reanalisar últimos 30 dias" (admin) que enfileira conversas encerradas sem registro

## UI — Relatórios

Nova aba "Satisfação" em `Relatorios.tsx` → página `RelatorioSatisfacao.tsx`.

**Filtros**: período, atendente, departamento, canal, classificação.

**Cards**:
- Score médio (1-5) + variação vs período anterior
- % positivos / neutros / negativos
- Total analisados / ignorados / com erro
- Tempo médio de primeira resposta

**Gráficos (Recharts)**:
- Donut: distribuição pelas 5 classificações
- Linha: evolução do score médio por dia
- Barras: ranking de atendentes por score médio
- Barras horizontais: pontos negativos mais frequentes (agregados por palavra-chave)

**Tabela**:
- Data | Contato | Atendente | Canal | Classificação (badge colorido) | Score | Tempo 1ª resp. | Justificativa truncada
- Click → abre `ContatoDrawer` com detalhes completos da análise

**Timeline do contato**: novo evento `satisfacao` com emoji e classificação no `ContatoTimeline`.

## Detalhes Técnicos

- Migration cria tabela, enums, índices, trigger e estende `ia_config`
- Cron registrado via tool `supabase--insert` (não migration, pois contém URL/anon key específicos)
- Edge function nova: `supabase/functions/analisar-satisfacao/index.ts`
- Função SQL `relatorio_satisfacao(p_inicio, p_fim, p_atendente_id, p_departamento_id, p_canal)` para agregar dados do relatório com SECURITY DEFINER + check de tenant
- Função SQL `contato_timeline` atualizada para incluir eventos de satisfação
- Tipos TS regenerados automaticamente após migration

## Entregáveis

1. Migration: tabela `atendimento_satisfacao`, enums, trigger, extensão `ia_config`, função `relatorio_satisfacao`, atualização `contato_timeline`
2. Cron job via `supabase--insert`
3. Edge Function `analisar-satisfacao`
4. UI: seção em `IAConfig.tsx`, página `RelatorioSatisfacao.tsx`, nova aba em `Relatorios.tsx`, evento na timeline
