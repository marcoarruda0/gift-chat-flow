## 🎯 Objetivo

Permitir que o tenant configure **regras de comunicação** (ex.: "giftback criado", "saldo vencendo em 3 dias", "expirou ontem") associando cada uma a um **template aprovado do WhatsApp Cloud**. Um **cronjob diário único** (horário configurável pelo tenant) processa todas as regras ativas e dispara as mensagens.

Decisões aprovadas:
- **Canal**: somente WhatsApp Oficial (Cloud API), reusando templates já aprovados.
- **Eventos**: tenant define livremente (tipo de gatilho + offset em dias). Não há eventos fixos no código.
- **Variáveis**: catálogo amplo — `nome_cliente`, `nome_empresa`, `valor_giftback`, `id_giftback`, `data_vencimento`, `dias_ate_expirar`, `saldo_giftback`.
- **Horário**: um único HH:MM por tenant para todas as regras.

---

## 📐 Modelo de dados

### Nova tabela `giftback_comunicacao_config` (1 por tenant — settings globais)
| coluna | tipo | default | descrição |
|---|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` | |
| `tenant_id` | uuid UNIQUE | — | RLS por tenant |
| `ativo` | boolean | `true` | desliga TODO o cronjob desse tenant |
| `horario_envio` | time | `'09:00'` | HH:MM no fuso `America/Sao_Paulo` |
| `created_at` / `updated_at` | timestamptz | `now()` | |

### Nova tabela `giftback_comunicacao_regras` (N por tenant — uma regra por evento)
| coluna | tipo | descrição |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid | RLS |
| `nome` | text | rótulo livre ("Aviso 3 dias antes") |
| `ativo` | boolean | liga/desliga só essa regra |
| `tipo_gatilho` | enum `gb_gatilho_tipo` | `criado` \| `vencendo` \| `expirado` |
| `dias_offset` | integer | dias relativos: `criado` ignora; `vencendo` = X dias antes (ex.: 3); `expirado` = X dias depois (ex.: 0 ou 1) |
| `template_name` | text | nome do template Cloud aprovado |
| `template_language` | text | ex.: `pt_BR` |
| `template_components` | jsonb | snapshot dos components (mesmo padrão de `campanhas`) |
| `template_variaveis` | jsonb | mapping `{ "body.1": "{{nome_cliente}}", "body.2": "R$ {{valor_giftback}}", ... }` |
| `created_at` / `updated_at` | timestamptz | |

Index: `(tenant_id, tipo_gatilho, dias_offset)` para lookup rápido.

### Nova tabela `giftback_comunicacao_log` (auditoria — evita reenvio)
| coluna | tipo | descrição |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid | RLS |
| `regra_id` | uuid | FK lógica para `giftback_comunicacao_regras` |
| `movimento_id` | uuid | FK lógica para `giftback_movimentos` |
| `contato_id` | uuid | |
| `enviado_em` | timestamptz | `now()` |
| `status` | text | `enviado` \| `falha` \| `sem_telefone` |
| `wa_message_id` | text | retorno da Graph API |
| `erro` | text | nullable |

**Constraint chave**: `UNIQUE (regra_id, movimento_id)` — garante idempotência (cada regra só dispara 1x por giftback).

### RLS de todas as tabelas acima
- SELECT: `tenant_id = get_user_tenant_id(auth.uid())`
- INSERT/UPDATE/DELETE: idem + `has_role('admin_tenant')`
- Edge function escreve com service role (bypassa RLS).

---

## 🛠️ Backend: Edge Function `processar-comunicacoes-giftback`

Arquivo: `supabase/functions/processar-comunicacoes-giftback/index.ts`

### Lógica (executada via cron a cada 15 min — explica abaixo)

1. **Buscar tenants elegíveis agora**: `SELECT * FROM giftback_comunicacao_config WHERE ativo=true AND horario_envio entre (now BRT - 7min, now BRT + 7min)`. Janela de tolerância evita problemas de drift do cron.
2. Para cada tenant:
   - Verificar se já rodou hoje (consultar `giftback_comunicacao_log` com `enviado_em::date = today AND tenant_id`). Se sim, pular.
   - Carregar todas as regras ativas do tenant + config Cloud (`whatsapp_cloud_config`).
   - Para cada regra:
     - **`criado`**: buscar `giftback_movimentos` com `tipo='credito'`, `status='ativo'`, `created_at::date = today`.
     - **`vencendo`**: buscar com `validade = today + dias_offset`, `status='ativo'`.
     - **`expirado`**: buscar com `status='expirado'`, `validade = today - dias_offset` (ou usar log de expiração via cron `expirar-giftbacks`).
   - Para cada movimento encontrado:
     - **Pular se já existe log** `(regra_id, movimento_id)` — UPSERT garante idempotência via UNIQUE.
     - Resolver variáveis (catálogo abaixo) com dados do contato + movimento + tenant.
     - Montar `components` no formato Graph API (mesmo padrão de `enviar-campanha-cloud`).
     - POST para `https://graph.facebook.com/v21.0/{phone_number_id}/messages`.
     - Inserir log com `status='enviado'` ou `status='falha'` + erro.
   - Pequeno delay aleatório entre envios (500–2000ms) para não estourar rate limit da Meta.

### Resolver variáveis disponíveis

Função utilitária (compartilhada com `enviar-campanha-cloud` no futuro, mas inicialmente local):

```ts
const VARS = {
  nome_cliente: contato.nome,
  nome_empresa: tenant.nome,
  valor_giftback: formatBRL(movimento.valor),
  saldo_giftback: formatBRL(contato.saldo_giftback),
  id_giftback: movimento.id.slice(0, 8).toUpperCase(),
  data_vencimento: format(movimento.validade, "dd/MM/yyyy"),
  dias_ate_expirar: differenceInDays(movimento.validade, today).toString(),
};
```

Substitui `{{var}}` em cada `template_variaveis[campo]` e injeta nos `components`.

### Cron schedule (via tool `supabase--insert`, NÃO migration)

Roda **a cada 15 min**; a function decide internamente se é o horário do tenant. Isso permite que cada tenant escolha qualquer HH:MM sem alterar o cron.

```sql
select cron.schedule(
  'processar-comunicacoes-giftback-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://ywcgburxzwukjtqxuhyr.supabase.co/functions/v1/processar-comunicacoes-giftback',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

`verify_jwt = false` em `supabase/config.toml` para essa function (igual `expirar-giftbacks`).

---

## 🎨 Frontend

### Nova aba em `GiftbackConfig.tsx`: **"Comunicações"**

Adicionar 4ª `TabsTrigger` ao lado de Configuração / RFV / Relatório.

#### Componente `src/components/giftback/ComunicacoesGiftbackTab.tsx`

**Bloco superior — Configuração geral** (1 linha):
- Switch "Ativar comunicações automáticas"
- Input `time` "Horário de envio diário" (HH:MM)
- Botão "Salvar" → upsert em `giftback_comunicacao_config`
- Aviso se WhatsApp Cloud não estiver configurado: "Configure o WhatsApp Oficial antes de criar regras" + link para `/configuracoes/whatsapp-oficial`

**Bloco principal — Tabela de regras**:
- Botão "+ Nova regra" abre dialog
- Colunas: Nome | Gatilho | Quando | Template | Status | Ações (editar / excluir / toggle ativo)
- Empty state com CTA

#### Componente `src/components/giftback/RegraComunicacaoDialog.tsx`

Form fields:
1. **Nome da regra** (text)
2. **Tipo de gatilho** (select): "Giftback criado" | "Saldo vencendo" | "Giftback expirado"
3. **Dias** (number) — visível só para `vencendo`/`expirado`. Label dinâmico:
   - vencendo: "X dias **antes** do vencimento"
   - expirado: "X dias **após** expirar (0 = mesmo dia)"
4. **Template** (reuso de `TemplateCampanhaPicker` ou variante simplificada): lista templates com `status='APPROVED'` do tenant.
5. **Mapeamento de variáveis**: para cada placeholder `{{n}}` do template, mostrar input com botão "Inserir variável" (popover lista o catálogo `nome_cliente`, `valor_giftback`, etc.). Reusa padrão do `InsertVariableButton.tsx` adaptado para variáveis de giftback.
6. **Preview** ao vivo do texto final usando dados mock.
7. **Ativo** (switch).

Salva via `INSERT/UPDATE` em `giftback_comunicacao_regras`.

#### Componente `src/components/giftback/InsertGiftbackVarButton.tsx`

Popover com lista clicável:
- `{{nome_cliente}}` — Nome do cliente
- `{{nome_empresa}}` — Nome da loja
- `{{valor_giftback}}` — Valor (R$ XX,XX)
- `{{id_giftback}}` — ID curto (8 chars)
- `{{saldo_giftback}}` — Saldo total atual
- `{{data_vencimento}}` — DD/MM/AAAA
- `{{dias_ate_expirar}}` — Número

Insere no input ativo (controle via ref).

#### Bloco "Histórico" (opcional nesta sprint, recomendo incluir)
Tabela enxuta dos últimos 50 logs de `giftback_comunicacao_log` com regra, contato, status, data — para debug/auditoria.

---

## 🧪 Testes

### `src/lib/__tests__/giftback-comunicacao.test.ts` (novo)

Extrair lógica pura para `src/lib/giftback-comunicacao.ts`:
- `resolverVariaveis(template, contexto)` — substitui `{{var}}` 
- `montarComponentsTemplate(components, variaveisMap, contexto)` — integra com Graph API format
- `tenantDeveRodarAgora(horarioConfig, agoraBRT, toleranciaMin)` — valida janela do cron

Casos:
- Variáveis básicas resolvem corretamente.
- Variável inexistente vira string vazia (não quebra).
- `dias_ate_expirar` calcula correto incluindo casos de hoje (0), passado (negativo).
- Janela de tolerância: `09:00` aceita `08:54` a `09:06`, rejeita `08:50` e `09:10`.
- Preview formatBRL: `99` → `R$ 99,00`.

---

## 📁 Arquivos afetados

| Tipo | Arquivo |
|---|---|
| Migration | criar 3 tabelas (`config`, `regras`, `log`) + enum `gb_gatilho_tipo` + RLS |
| Novo | `supabase/functions/processar-comunicacoes-giftback/index.ts` |
| Editado | `supabase/config.toml` (adicionar bloco `verify_jwt = false` da nova function) |
| SQL via insert tool | `cron.schedule` a cada 15min |
| Editado | `src/pages/GiftbackConfig.tsx` (nova aba) |
| Novo | `src/components/giftback/ComunicacoesGiftbackTab.tsx` |
| Novo | `src/components/giftback/RegraComunicacaoDialog.tsx` |
| Novo | `src/components/giftback/InsertGiftbackVarButton.tsx` |
| Novo | `src/lib/giftback-comunicacao.ts` (lógica pura) |
| Novo | `src/lib/__tests__/giftback-comunicacao.test.ts` |

---

## ⚠️ Riscos e Considerações

1. **Templates aprovados pela Meta** — usuário precisa ter ao menos 1 template `APPROVED` no `whatsapp_cloud_templates`. UI alerta caso não tenha.
2. **Idempotência** garantida pelo UNIQUE `(regra_id, movimento_id)` no log + check antes de enviar.
3. **Fuso horário**: cron roda em UTC; conversão para `America/Sao_Paulo` é feita dentro da function via `toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })` para comparar com `horario_envio`.
4. **Rate limit Meta**: delay 0.5–2s entre mensagens; se tenant tiver 1000 contatos vencendo no mesmo dia, processo demora ~15min — aceitável (cron próximo só roda em 15min de qualquer forma e a verificação "já rodou hoje" evita duplicação).
5. **Lógica de "expirou"** depende do cron `expirar-giftbacks` ter rodado antes (03:00 UTC = 00:00 BRT). Como o cron de comunicação roda no horário do tenant (tipicamente 9h+), sempre haverá dados corretos.
6. **Variável `dias_ate_expirar` em mensagem `criado`**: calcula corretamente baseado em `validade` do movimento.

---

## 🚫 Fora deste sprint

- Múltiplos canais (Z-API, e-mail, SMS).
- Segmentação avançada (regra só para clientes RFV "ouro", por exemplo).
- A/B testing de templates.
- Reagendamento manual de mensagens falhas (admin precisa reativar rodando next day).
- Dashboard analítico (taxa de abertura, etc.) — depende de webhook de status que já existe mas não está conectado a este fluxo.
