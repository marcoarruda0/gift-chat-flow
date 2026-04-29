# Plano: Integração com Instagram (Direct Messages)

Objetivo: permitir que o tenant conecte uma conta **Instagram Business/Creator** (vinculada a uma Página do Facebook) e receba/envie DMs dentro do módulo Conversas, no mesmo padrão já usado para WhatsApp Cloud.

---

## 1. Pré-requisitos do lado da Meta (one-time, manual pelo dono do app)

Estas etapas o **usuário** precisa fazer no Meta Developers — não há como Lovable automatizar:

1. Ter um **App Meta** (já existe, pois usamos WhatsApp Cloud — `META_APP_SECRET` configurado).
2. Adicionar o produto **Instagram Graph API** + **Webhooks** ao mesmo app.
3. Solicitar/ter aprovadas as permissões:
   - `instagram_basic`
   - `instagram_manage_messages`
   - `pages_manage_metadata` (para subscribe ao webhook da Página)
   - `pages_show_list`, `pages_read_engagement`
4. A conta Instagram precisa ser **Business ou Creator** e estar **vinculada a uma Página Facebook**.
5. App em modo **Live** (ou o usuário Instagram precisa estar como tester durante dev).

O plano abaixo entrega tudo do nosso lado para suportar isso.

---

## 2. Modelo de dados (migração SQL)

### 2.1 Nova tabela `instagram_config` (1 por tenant)

| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid UNIQUE FK tenants | |
| ig_user_id | text | ID do Instagram Business Account |
| ig_username | text | @handle |
| page_id | text | Página FB vinculada |
| page_access_token | text | token de longa duração (60d) |
| user_access_token | text | token do usuário (para refresh) |
| token_expires_at | timestamptz | |
| verify_token | text | usado no handshake do webhook |
| status | text | `desconectado` / `conectado` / `erro` |
| ultima_mensagem_at, ultimo_erro, ultima_verificacao_at | | mesmo padrão do whatsapp_cloud_config |
| created_at, updated_at | | |

RLS: mesma estrutura do `whatsapp_cloud_config` (members view, admins manage).

### 2.2 Ajuste em `conversas`

- Relaxar/atualizar o CHECK `conversas_canal_check` para incluir `'instagram'`.
- Adicionar coluna opcional `instagram_thread_id text` (id da conversa do IG, útil para deduplicar).
- Atualizar índice único parcial `conversas_tenant_contato_canal_unique` continua funcionando (já considera `canal`).

### 2.3 Ajuste em `contatos`

- Adicionar `instagram_id text` e `instagram_username text` nullable + índice por tenant.
- Permitir contato sem telefone quando origem é Instagram (revisar constraints/validações no front).

---

## 3. Edge Functions (3 novas)

### 3.1 `instagram-webhook` (público, `verify_jwt = false`)
- **GET**: handshake `hub.mode=subscribe` validando `verify_token` contra `instagram_config`.
- **POST**: validar assinatura `X-Hub-Signature-256` com `META_APP_SECRET`.
- Processar `entry[].messaging[]`:
  - Mapear `sender.id` (IGSID) → `contatos` (cria se não existir, com `instagram_id`/`instagram_username` buscado via Graph `/{igsid}?fields=name,username,profile_pic`).
  - Encontrar/criar `conversas` (canal=`instagram`).
  - Inserir em `mensagens` (texto, image, audio, video, share, story_reply, reaction).
  - Baixar mídias da CDN da Meta e armazenar em `chat-media` (mesmo padrão do WhatsApp Cloud).
  - Atualizar `ultima_msg_at`, `nao_lidas`, `ultimo_texto`.
- Disparar fluxo automático "resposta padrão" (reusar lógica de `whatsapp-cloud-webhook`).

### 3.2 `instagram-proxy` (autenticada via JWT)
- Wrapper para chamadas Graph API a partir do front (envio de mensagens, list threads, etc.).
- Carrega `page_access_token` do tenant do usuário logado.
- Endpoints suportados:
  - `POST /{ig_user_id}/messages` — enviar texto/mídia/template.
  - `GET /{igsid}` — perfil do usuário.
  - `GET /{ig_user_id}/conversations` — listar threads (para sincronização inicial).
- Suporte a multipart para upload de mídia (mesmo padrão de `whatsapp-cloud-proxy`).

### 3.3 `instagram-refresh-token` (cron, `verify_jwt = false`)
- Rodar diariamente; renovar `page_access_token` quando faltar < 7 dias para expirar (`/oauth/access_token?grant_type=ig_refresh_token`).
- Atualizar `token_expires_at` e `ultima_verificacao_at`.
- Marcar `status='erro'` + `ultimo_erro` em falha.

Adicionar em `supabase/config.toml`:
```toml
[functions.instagram-webhook]
verify_jwt = false
[functions.instagram-refresh-token]
verify_jwt = false
```

---

## 4. UI — Configuração

### 4.1 Nova página `src/pages/InstagramConfig.tsx`
Espelhar `WhatsappOficialConfig.tsx`, com:
- Form: `ig_user_id`, `page_id`, `user_access_token` (cole o token de longa duração obtido no Graph Explorer ou via fluxo OAuth).
- Botão **Testar conexão** → chama `instagram-proxy` (`GET /{ig_user_id}?fields=username`).
- Botão **Inscrever webhook** → chama Graph `POST /{page_id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_reactions`.
- Mostrar URL do webhook (`{SUPABASE_URL}/functions/v1/instagram-webhook`) e `verify_token` para colar no painel Meta.
- Status, última mensagem recebida, último erro (igual WhatsApp Cloud).
- Card de auditoria/diagnóstico opcional (fase 2).

### 4.2 Card em `Configuracoes.tsx`
Adicionar um card "Configuração Instagram" abaixo do Z-API/WhatsApp Cloud, ícone Instagram (lucide), navegando para `/configuracoes/instagram`.

### 4.3 OAuth opcional (fase 2)
Implementar fluxo "Conectar com Facebook" (login Meta) que faz pop-up OAuth, troca `code` por `user_access_token`, lista páginas do usuário e auto-preenche o form. Por ora o caminho manual com token colado é suficiente para destravar.

---

## 5. UI — Conversas

Mudanças mínimas em `src/components/conversas/*` e `src/pages/Conversas.tsx`:
- Reconhecer `canal === 'instagram'`: ícone Instagram colorido nos itens da lista, label "Instagram" no header da conversa.
- `ChatInput`: bloquear envio se passou da janela de **24 horas** desde a última mensagem do usuário (regra Meta para mensagens fora-de-sessão), exibindo aviso. (Templates aprovados são uma fase 2.)
- `AttachmentButton`: limitar tipos suportados pelo IG (imagem, vídeo até 25MB, áudio).
- `NovaConversaDialog`: aba "Instagram" aceita `@username` ou IGSID, busca via proxy.

---

## 6. Roteamento e navegação

- `src/App.tsx`: rota `/configuracoes/instagram` → `InstagramConfig`.
- `AppSidebar` não muda (acesso via Configurações).

---

## 7. Tarefas técnicas (ordem de execução)

1. Migração SQL: tabela `instagram_config`, ajuste CHECK de `conversas`, colunas em `contatos`.
2. Edge function `instagram-webhook` (handshake + ingestão básica de texto).
3. Edge function `instagram-proxy` (testar conexão + enviar texto).
4. Página `InstagramConfig.tsx` + card em `Configuracoes`.
5. Adaptar componentes de Conversas para canal `instagram`.
6. Suporte a mídia (upload/download via `chat-media`).
7. Edge function `instagram-refresh-token` + agendar cron diário.
8. Validar regra de janela 24h e fluxos automáticos.
9. (Fase 2) OAuth login com Facebook + listagem de páginas.
10. (Fase 2) Templates/HSMs e respostas a stories/reactions.

---

## 8. O que será pedido ao usuário

Antes de implementar, ele precisará providenciar/confirmar:

1. App Meta com produto **Instagram Graph API** habilitado e permissões aprovadas.
2. Conta IG Business vinculada a uma Página FB.
3. **Page Access Token de longa duração** (60d) com os escopos listados acima.
4. `ig_user_id` e `page_id` (obtidos via `/me/accounts` no Graph Explorer).

Esses valores serão preenchidos na nova tela de configuração — **não** vão para secrets globais (são por-tenant, igual ao WhatsApp Cloud).

---

## 9. Fora do escopo desta primeira entrega

- Stories mentions/replies completos.
- Comentários em posts (é outra API: `instagram_manage_comments`).
- Templates HSM / mensagens fora da janela de 24h.
- Fluxo OAuth completo (entra na fase 2 — fase 1 usa token colado).

Se aprovar, sigo para a implementação começando pela migração e webhook.