

# Módulo "Peça Rara" — Notificações Automáticas via Pinóquio + Z-API

## Resumo

Novo módulo genérico multi-tenant que consulta a API do sistema Pinóquio para buscar cadastramentos pendentes de aprovação e envia notificações automáticas via WhatsApp (Z-API já integrada). Inclui dashboard, histórico, template editável, configuração e polling automático via cron job.

## Arquitetura

```text
┌──────────────────┐     ┌──────────────────────┐     ┌──────────────┐
│  Frontend (React)│────▶│  Edge: pinoquio-sync  │────▶│  API Pinóquio│
│  4 telas/abas    │     │  (cron + manual)      │     └──────────────┘
└──────────────────┘     │                       │
                         │  Para cada pendente:  │     ┌──────────────┐
                         │  envia via Z-API ─────│────▶│  Z-API (já   │
                         │  registra notificação │     │  configurada)│
                         └──────────────────────┘     └──────────────┘
```

## Banco de Dados (3 tabelas + cron)

### Tabela `pinoquio_config`
Configuração por tenant (JWT, polling, template).

| Coluna | Tipo | Default |
|--------|------|---------|
| id | uuid PK | gen_random_uuid() |
| tenant_id | uuid NOT NULL | — |
| jwt_token | text NOT NULL | — |
| intervalo_polling_min | int | 10 |
| polling_ativo | boolean | false |
| template_mensagem | text | (template padrão do prompt) |
| api_base_url | text | 'https://api-pinoquio.pecararabrecho.com.br/api' |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

RLS: mesmo padrão admin_tenant (select all tenant, insert/update/delete admin only). UNIQUE on tenant_id.

### Tabela `pinoquio_notificacoes`
Log de cada notificação enviada (ou tentada).

| Coluna | Tipo |
|--------|------|
| id | uuid PK |
| tenant_id | uuid NOT NULL |
| cadastramento_id | int NOT NULL |
| cadastramento_id_external | text |
| fornecedor_nome | text |
| fornecedor_telefone | text |
| lote | text |
| link_aprovacao | text |
| mensagem_enviada | text |
| status | text ('pendente'/'enviado'/'erro'/'sem_telefone'/'ignorado') |
| erro_mensagem | text nullable |
| enviado_at | timestamptz nullable |
| created_at | timestamptz default now() |

RLS: tenant isolation. UNIQUE(tenant_id, cadastramento_id) para evitar duplicatas.

### Tabela `pinoquio_execucoes`
Log de cada execução do polling.

| Coluna | Tipo |
|--------|------|
| id | uuid PK |
| tenant_id | uuid NOT NULL |
| executado_em | timestamptz default now() |
| total_pendentes | int |
| total_novos_enviados | int |
| total_erros | int |
| total_ignorados | int |

RLS: tenant isolation (select only).

### Cron Job
Usando `pg_cron` + `pg_net` para invocar a edge function `pinoquio-sync` a cada 5 minutos. A function verifica internamente quais tenants têm `polling_ativo = true` e processa cada um.

## Edge Function: `pinoquio-sync`

Lógica principal:
1. Recebe `{ tenant_id }` (manual) ou sem body (cron — processa todos tenants ativos)
2. Busca `pinoquio_config` do tenant
3. Chama API Pinóquio com paginação (percorre todas as páginas)
4. Para cada cadastramento:
   - Verifica regras: `is_products_approved_by_fornecedor != true`, `acquisition_type_choosed == null`
   - Verifica se já existe em `pinoquio_notificacoes` (já notificado → ignora)
   - Se sem telefone → registra como "sem_telefone"
   - Monta link: `https://pinoquio.pecararabrecho.com.br/external/fornecedor/{id_external}/confirmacao-produtos?origin=link`
   - Aplica template com variáveis: `{id}`, `{link}`, `{fornecedor_name}`, `{qty_total}`, `{valor_pix}`, `{valor_consignacao}`, `{data_limite}`
   - Envia via Z-API (reutiliza `zapi_config` do tenant)
   - Registra resultado em `pinoquio_notificacoes`
5. Registra execução em `pinoquio_execucoes`

## Frontend: 4 abas em nova página `/peca-rara`

### Aba 1 — Dashboard
- Tabela com cadastramentos pendentes da API Pinóquio (fetch ao vivo)
- Colunas: Lote (R-{id}), Fornecedor, Telefone, Peças, Valor Pix, Valor Consignação, Data Limite, Status Notificação
- Botão "Notificar" individual + "Notificar Todos Pendentes"
- Filtros por data e status

### Aba 2 — Histórico
- Lista de `pinoquio_notificacoes` com data/hora, lote, fornecedor, telefone, status, erro
- Botão reenviar para mensagens com erro

### Aba 3 — Template
- Editor de texto com variáveis disponíveis
- Preview ao vivo com dados de exemplo

### Aba 4 — Configuração
- JWT do Pinóquio, URL base da API
- Intervalo de polling (5/10/15 min), toggle ativo/desativo
- Botão "Testar Conexão" (GET na API Pinóquio)

### Sidebar
- Novo item "Peça Rara" (ou "Notificações") com ícone adequado

## Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| Migration SQL | 3 tabelas + RLS + cron job |
| `supabase/functions/pinoquio-sync/index.ts` | Edge function principal |
| `src/pages/PecaRara.tsx` | Página com 4 abas |
| `src/components/AppSidebar.tsx` | Adicionar item "Peça Rara" |
| `src/App.tsx` | Adicionar rota `/peca-rara` |

## Regras de Negócio (resumo)
- Cada cadastramento recebe apenas 1 notificação automática; reenvio só manual
- Não notificar se já aprovado ou já escolheu pagamento
- Não notificar sem telefone (registrar como "sem_telefone")
- Prefixo `55` no telefone se necessário
- Template editável por tenant

