
# Plano: 3 melhorias no módulo Giftback → Comunicações

## 1. Filtro por RFM nas regras de comunicação

### Banco de dados (migração)
Adicionar 2 colunas em `giftback_comunicacao_regras`:
- `filtro_rfv_segmentos text[] NOT NULL DEFAULT '{}'` — segmentos selecionados (`campeoes`, `leais`, `potenciais`, `atencao`, `em_risco`, `perdidos`, `sem_dados`). Vazio = "todos".
- `filtro_rfv_modo text NOT NULL DEFAULT 'todos'` — `'todos'` (ignora filtro) ou `'incluir'` (apenas segmentos da lista).

### UI — `RegraComunicacaoDialog.tsx`
- Nova seção "Filtrar por segmento RFM (opcional)" com:
  - RadioGroup: "Enviar para todos" / "Apenas segmentos selecionados"
  - Quando "selecionados": grid de checkboxes coloridos usando `SEGMENTOS_ORDENADOS` de `src/lib/rfv-segments.ts` (badges com `cor` HEX inline).
- Persistir nos campos novos via mutation existente.

### Backend — `processar-comunicacoes-giftback`
- Após buscar contatos do batch, derivar segmento de cada contato com função local equivalente a `getSegmentoBySoma(rfv_recencia, rfv_frequencia, rfv_valor)` (incluir `rfv_recencia/frequencia/valor` no SELECT de `contatos`).
- Se `regra.filtro_rfv_modo === 'incluir'` e `filtro_rfv_segmentos.length > 0`, pular movimentos cujo contato não está na lista. Logar como `status='filtrado_rfv'` opcionalmente, ou simplesmente ignorar sem registrar.

### Lib pura
- Replicar mini-função `segmentoFromSoma()` em `src/lib/giftback-comunicacao.ts` (e cópia interna na edge function — projeto já segue esse padrão).
- Adicionar testes em `src/lib/__tests__/giftback-comunicacao.test.ts` para o filtro de segmento.

---

## 2. Botão "Disparar teste" para um contato

### UI — novo componente `TestarRegraDialog.tsx` (ou inline no `RegraComunicacaoDialog`)
- Botão "Enviar teste" no rodapé do `RegraComunicacaoDialog` (visível apenas quando regra existente — `regra?.id`).
- Dialog contém:
  - Combobox de busca de contato (query em `contatos` por nome/telefone, scoped tenant).
  - Seletor de movimento de giftback do contato (último crédito; ou opção "usar dados de exemplo" se contato não tiver movimento).
  - Pré-visualização do BODY já com variáveis resolvidas (reusa `buildPreviewText` + `buildVarsMap` com dados reais).
  - Botão "Enviar agora via WhatsApp Oficial".

### Edge function nova: `enviar-teste-comunicacao-giftback`
- Auth: valida JWT do usuário (header Authorization), lê `tenant_id` via `profiles`.
- Body: `{ regra_id, contato_id, movimento_id? }`.
- Carrega regra (mesmo tenant), contato, movimento (se informado) ou monta mock; carrega `whatsapp_cloud_config`; monta payload idêntico ao cron e envia para Graph API.
- Registra log em `giftback_comunicacao_log` com flag/erro identificando teste — adicionar coluna `is_teste boolean DEFAULT false` para distinguir testes de envios reais.
- Retorna `{ ok, wa_message_id, preview_text, payload_enviado }` para feedback em tempo real.

### Config
- Adicionar bloco `[functions.enviar-teste-comunicacao-giftback]` em `supabase/config.toml` com `verify_jwt = true` (pois é ação autenticada do admin).

### UX
- Toast de sucesso/falha após envio. Mostrar `wa_message_id` retornado.

---

## 3. Exportação CSV/PDF dos últimos envios

### UI — nova seção em `ComunicacoesGiftbackTab.tsx` (substitui o card "Últimos envios" atual)
- Filtros no topo (acima da tabela):
  - **Regra**: Select com lista de regras do tenant (+ "Todas").
  - **Gatilho**: Select `criado` / `vencendo` / `expirado` / "Todos".
  - **Status**: Select `enviado` / `falha` / `sem_telefone` / "Todos".
  - **Período**: 2 inputs date (de / até) — default últimos 30 dias.
- Tabela paginada (50 por página) com: Data, Regra, Gatilho, Contato (nome+telefone), Status, Erro, wa_message_id.
- Botões no header: "Exportar CSV" e "Exportar PDF".

### Query
- Hook `useGbComLogs(filtros)` com `useQuery` em `giftback_comunicacao_log` LEFT JOIN `giftback_comunicacao_regras` (via `regra_id`) e `contatos` (via `contato_id`). Como Supabase não faz join arbitrário, usar duas queries (logs + maps) ou foreign keys embedded — vou adicionar FKs:
  - `giftback_comunicacao_log.regra_id → giftback_comunicacao_regras(id)` (ON DELETE SET NULL para preservar histórico)
  - `giftback_comunicacao_log.contato_id → contatos(id)` (ON DELETE SET NULL)
  - Permite usar `select("*, regra:giftback_comunicacao_regras(nome,tipo_gatilho), contato:contatos(nome,telefone)")`.

### Exportação CSV (frontend puro)
- Função `exportarLogsCSV(logs)` em `src/lib/giftback-comunicacao-export.ts`:
  - Gera CSV UTF-8 com BOM (Excel pt-BR), separador `;`, escapando `"`.
  - Colunas: Data/Hora, Regra, Gatilho, Contato, Telefone, Status, Erro, WA Message ID, Teste (sim/não).
  - Download via `Blob` + `URL.createObjectURL`.

### Exportação PDF (frontend)
- Adicionar dependência `jspdf` + `jspdf-autotable` (leves, ~150kb).
- Função `exportarLogsPDF(logs, filtros, tenantNome)`:
  - Cabeçalho: nome do tenant, "Relatório de envios de Giftback", filtros aplicados, data de geração.
  - Tabela com `autoTable`: mesmas colunas (sem WA Message ID por espaço).
  - Rodapé com numeração de páginas.
  - Download `comunicacoes-giftback-YYYY-MM-DD.pdf`.

### Limites
- Exportação respeita filtros aplicados; cap em 5.000 linhas (mostrar aviso se atingir limite, sugerindo refinar período).

---

## Resumo de arquivos

**Migração (1 nova)**:
- Adiciona `filtro_rfv_segmentos`, `filtro_rfv_modo` em `giftback_comunicacao_regras`.
- Adiciona `is_teste` em `giftback_comunicacao_log`.
- Adiciona FKs `giftback_comunicacao_log → regras / contatos`.

**Backend (1 nova edge function + 1 modificada)**:
- `supabase/functions/enviar-teste-comunicacao-giftback/index.ts` (novo)
- `supabase/functions/processar-comunicacoes-giftback/index.ts` (filtro RFM)
- `supabase/config.toml` (registrar nova função)

**Frontend (3 modificados + 2 novos)**:
- `src/components/giftback/RegraComunicacaoDialog.tsx` — filtro RFM + botão "Enviar teste"
- `src/components/giftback/ComunicacoesGiftbackTab.tsx` — filtros + exportação
- `src/components/giftback/TestarRegraDialog.tsx` (novo) — UI de envio de teste
- `src/lib/giftback-comunicacao.ts` — helper `segmentoFromSoma`
- `src/lib/giftback-comunicacao-export.ts` (novo) — funções CSV/PDF

**Testes**:
- `src/lib/__tests__/giftback-comunicacao.test.ts` — cenários de filtro RFM + parser CSV.

**Dependências novas**: `jspdf`, `jspdf-autotable`.
