
# Sprint 1 — Status de entrega + Templates WhatsApp Oficial

Implementação focada em duas capacidades centrais da Frente 1: rastrear o status real de entrega das mensagens enviadas pela Cloud API e permitir que o usuário gerencie templates direto da plataforma (sync + criação).

## 1. Status de entrega de mensagens

### 1.1 Schema (migration)
```sql
ALTER TABLE public.mensagens
  ADD COLUMN status_entrega text,
  ADD COLUMN status_entrega_at timestamptz;

CREATE INDEX idx_mensagens_wa_msg_id
  ON public.mensagens ((metadata->>'wa_message_id'))
  WHERE metadata ? 'wa_message_id';
```
Valores esperados em `status_entrega`: `sent | delivered | read | failed`.

### 1.2 Webhook (`whatsapp-cloud-webhook/index.ts`)
- Quando `value.statuses[]` vier no payload, iterar e fazer `UPDATE mensagens` casando por `metadata->>'wa_message_id' = status.id`.
- Gravar `status_entrega = status.status` e `status_entrega_at = to_timestamp(status.timestamp)`.
- Para `failed`, mesclar `status.errors[]` em `metadata.delivery_errors` para diagnóstico.
- Contabilizar atualizações no `whatsapp_webhook_eventos.mensagens_criadas` (ou novo campo `status_atualizados` — aproveitar o existente para evitar nova migration).

### 1.3 Persistir `wa_message_id` ao enviar
- No `handleSendTest` em `WhatsappOficialConfig.tsx`: pegar `messages[0].id` da resposta do proxy e salvar em `metadata.wa_message_id` ao inserir a mensagem local.
- (Conversas via Cloud API ainda não enviam — fica para Sprint 2; hoje só o teste/template envia.)

### 1.4 UI (`MessageBubble.tsx`)
- Adicionar prop `statusEntrega` (vinda da query de mensagens).
- Renderizar abaixo do horário, apenas para `remetente='atendente'` em conversa `whatsapp_cloud`:
  - `sent` → ✓ cinza
  - `delivered` → ✓✓ cinza
  - `read` → ✓✓ azul
  - `failed` → ⚠ vermelho com tooltip mostrando `metadata.delivery_errors[0].message`
- Ícones via lucide (`Check`, `CheckCheck`, `AlertCircle`).
- `ChatPanel.tsx`: incluir `status_entrega` e `status_entrega_at` no `select` de mensagens e propagar para `MessageBubble`.

## 2. Templates: tabela + sync + submissão

### 2.1 Schema (migration)
```sql
CREATE TABLE public.whatsapp_cloud_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  meta_template_id text,
  name text NOT NULL,
  language text NOT NULL,
  category text,
  status text NOT NULL DEFAULT 'PENDING',
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason text,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, name, language)
);

ALTER TABLE public.whatsapp_cloud_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_view_templates ON public.whatsapp_cloud_templates
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY tenant_admin_insert_templates ON public.whatsapp_cloud_templates
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY tenant_admin_update_templates ON public.whatsapp_cloud_templates
  FOR UPDATE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY tenant_admin_delete_templates ON public.whatsapp_cloud_templates
  FOR DELETE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );
```

### 2.2 Sincronização com a Meta
- Reutilizar `whatsapp-cloud-proxy` com `useWabaId: true` e `endpoint: 'message_templates?fields=id,name,language,status,category,components,rejection_reason&limit=200'`, `method: GET`.
- Lógica de upsert client-side (chamada do botão "Sincronizar agora"): para cada template retornado, `upsert` por `(tenant_id, name, language)` — atualiza status, components e `synced_at`.
- Marcar como `DELETED` localmente templates que não vieram mais (opcional — por ora, manter histórico, sem deletar).

### 2.3 Criação de template via plataforma
- Form chama proxy com `useWabaId: true`, `endpoint: 'message_templates'`, `method: POST`, body:
  ```json
  {
    "name": "boas_vindas",
    "language": "pt_BR",
    "category": "UTILITY",
    "components": [
      { "type": "HEADER", "format": "TEXT", "text": "Olá {{1}}" },
      { "type": "BODY", "text": "Seu pedido {{1}} foi confirmado.", 
        "example": { "body_text": [["12345"]] } },
      { "type": "FOOTER", "text": "Loja Exemplo" },
      { "type": "BUTTONS", "buttons": [{ "type": "QUICK_REPLY", "text": "Ok" }] }
    ]
  }
  ```
- Após resposta da Meta com `id`, inserir registro local com `status='PENDING'` e `meta_template_id=<id>`.

### 2.4 UI
**Novo componente `TemplatesCard.tsx`:**
- Lista templates do tenant em tabela: nome, idioma, categoria, status (badge colorido), última sync.
- Botão "Sincronizar agora" → chama proxy + upsert.
- Botão "Criar template" → abre `CriarTemplateDialog`.
- Para `REJECTED`, mostrar `rejection_reason` no expand.

**Novo componente `CriarTemplateDialog.tsx`:**
- Campos:
  - Nome (validação snake_case, lowercase, ≤512 chars)
  - Idioma (select, default `pt_BR`; opções comuns: `pt_BR`, `en_US`, `es_ES`)
  - Categoria (radio: UTILITY / MARKETING / AUTHENTICATION)
  - Header (select tipo: nenhum / texto)
    - Se texto: input com 1 placeholder opcional `{{1}}` + exemplo
  - Body (textarea, obrigatório, suporta `{{1}}..{{n}}`) + área dinâmica de exemplos por placeholder
  - Footer (input opcional, ≤60 chars)
  - Botões (lista dinâmica, máx 3, tipo Quick Reply ou URL com placeholder opcional)
- Validação client-side antes de enviar (regex no nome, contagem de placeholders bate com exemplos).
- Aviso visual: "A aprovação pela Meta leva até 24h. Status será atualizado no próximo sync."

**Integração na página:**
- `WhatsappOficialConfig.tsx`: adicionar nova tab "Templates" (entre "Diagnóstico" e "Auditoria") renderizando `<TemplatesCard />`.

## 3. Tipos
- Após a migration, `src/integrations/supabase/types.ts` é regenerado automaticamente — não editar manualmente.

## 📁 Arquivos

**Migrations (2 novas):**
- `mensagens` + `status_entrega` + índice `wa_message_id`
- Tabela `whatsapp_cloud_templates` + RLS

**Edge function modificada:**
- `supabase/functions/whatsapp-cloud-webhook/index.ts` — handler de `statuses[]`

**Componentes novos:**
- `src/components/whatsapp-oficial/TemplatesCard.tsx`
- `src/components/whatsapp-oficial/CriarTemplateDialog.tsx`

**Componentes modificados:**
- `src/pages/WhatsappOficialConfig.tsx` — nova tab + persistir `wa_message_id` no `handleSendTest`
- `src/components/conversas/MessageBubble.tsx` — ícones de status
- `src/components/conversas/ChatPanel.tsx` — incluir colunas de status no fetch

## ✅ Como validar

1. Enviar template "hello_world" pelo botão de teste → mensagem aparece em `/conversas` com ✓.
2. Em segundos, status muda para ✓✓ (delivered) e depois ✓✓ azul (read) ao abrir no celular.
3. Aba Templates: clicar em "Sincronizar agora" → lista exibe `hello_world` (e quaisquer templates que existam na WABA) com status `APPROVED`.
4. Criar um template novo via dialog → aparece com badge `PENDING`. Após algumas horas, novo sync mostra `APPROVED` ou `REJECTED` com motivo.

## 🚫 Fora do escopo (vai para Sprint 2)
- Mídia inbound (image/audio/video/document do contato).
- Envio de mídia/texto livre via Cloud API a partir de `ChatInput`.
- Bloqueio da janela de 24h (depende de templates aprovados — implementar junto).
- Hardening (HMAC, idempotência, app_secret) — vai para Sprint 5.
