
# Campanhas via WhatsApp API Oficial (Cloud)

Excelente momento para isso — já temos templates aprovados, HMAC, status de entrega e alertas funcionando. Vamos estender o módulo de **Campanhas** para suportar um terceiro canal: **WhatsApp Oficial**, ao lado de WhatsApp (Z-API) e E-mail, **sem criar nova página**.

## Visão geral

Na Cloud API da Meta, **disparos em massa só podem ser feitos com Templates aprovados** (categorias `MARKETING`, `UTILITY` ou `AUTHENTICATION`). Não dá para enviar texto livre fora da janela de 24h. Por isso, a UX de campanha oficial é diferente da Z-API: em vez de digitar uma mensagem, o usuário **escolhe um template e preenche as variáveis**.

---

## Frente 1 — Banco de dados

### Migration
1. **`campanhas`**: adicionar colunas
   - `template_id uuid` (FK lógica para `whatsapp_cloud_templates.id`)
   - `template_name text` (snapshot do nome no momento da criação)
   - `template_language text` (snapshot do idioma)
   - `template_components jsonb default '[]'` — snapshot dos componentes
   - `template_variaveis jsonb default '{}'` — mapa `{ "body.1": "{nome}", "body.2": "Loja XYZ", "header.1": "..." }`
   - Atualizar enum de `canal` (atualmente `text`) para aceitar `'whatsapp_cloud'`

2. **`campanha_destinatarios`**: adicionar colunas para tracking nativo da Cloud API
   - `wa_message_id text` — id retornado pela Graph API (necessário para casar com webhook)
   - `status_entrega text` — `sent` / `delivered` / `read` / `failed` (espelha `mensagens.status_entrega`)
   - `status_entrega_at timestamptz`
   - `delivery_error jsonb` — payload de erro da Meta quando `failed`
   - Índice em `(campanha_id, status_entrega)` para métricas rápidas
   - Índice em `wa_message_id` para o webhook achar o destinatário

3. Atualizar `whatsapp-cloud-webhook` para, ao processar `statuses`, atualizar **tanto** `mensagens` **quanto** `campanha_destinatarios` quando o `wa_message_id` corresponder a um destinatário.

---

## Frente 2 — UI: estender `Campanhas.tsx`

### Seletor de canal
O `Tabs` já tem "Todas / WhatsApp / E-mail". Vamos para:
- **Todas**
- **WhatsApp (Z-API)** — `whatsapp`
- **WhatsApp Oficial** — `whatsapp_cloud` (badge verde com selo "Oficial")
- **E-mail** — `email`

Mesma lógica em `filtroCanal` e em `criarCampanha`.

### Form de criação (quando `canal = whatsapp_cloud`)
Substituir a seção de "mensagem livre + mídia" por:

1. **Card "Template aprovado"**
   - Select buscando `whatsapp_cloud_templates` com `status = 'APPROVED'` do tenant
   - Mostra: nome, idioma, categoria, badge de status
   - Se não houver templates aprovados → CTA "Criar template" (link para `/configuracoes/whatsapp-oficial?tab=templates`)
   - Botão "Sincronizar com Meta" (reaproveita lógica do `TemplatesCard`)

2. **Preview do template selecionado**
   - Renderiza header / body / footer / buttons como no `EnviarTemplateDialog`, com placeholders `{{1}}`, `{{2}}` destacados

3. **Mapeamento de variáveis**
   - Para cada `{{n}}` do header e body, um campo de input
   - Cada campo aceita:
     - **Texto fixo** (ex: "Loja XYZ")
     - **Variável de contato** via `InsertVariableButton` (já existe!) — `{nome}`, `{telefone}`, `{email}`, `{cpf}`, ou qualquer campo personalizado
   - Mostra um **preview "como o contato verá"** usando o primeiro contato do filtro como exemplo

4. **Reaproveitar do form atual**
   - Filtro de público (todos / tag / RFV / manual) — sem mudanças
   - Atraso entre envios — sem mudanças (Cloud API tem rate limits, mas atraso configurável continua útil)
   - Agendamento — sem mudanças

### Validação no `criarCampanha`
- `canal === 'whatsapp_cloud'` exige `template_id` selecionado
- Todas as variáveis `{{n}}` do template devem estar mapeadas
- Verificar que `whatsapp_cloud_config` está conectado para o tenant antes de permitir criar

### Listagem de campanhas
- Coluna **Canal**: badge "Oficial" (verde) vs "Z-API" (azul) vs "E-mail"
- Coluna **Tipo**: mostra nome do template em vez de "texto/imagem/..."

### Detalhe da campanha (`openDetail`)
Adicionar **métricas de funil oficial** (apenas para `whatsapp_cloud`):
- Enviados (sent)
- Entregues (delivered)
- Lidos (read)
- Falhas (failed) com tooltip do erro
- Taxa de entrega e taxa de leitura

Subscribe realtime em `campanha_destinatarios` filtrando por `campanha_id` para atualizar contadores ao vivo.

---

## Frente 3 — Edge function de envio

Criar **`enviar-campanha-cloud`** (não estender `enviar-campanha` para manter responsabilidades separadas e simplificar debugging).

Estrutura espelha `enviar-campanha` (chunked delay, fire-and-forget, idempotência por destinatário pendente), mas:

1. **Auth & input**: igual à existente (service role para chamadas internas, JWT do user na primeira chamada)

2. **Buscar config**:
   - `whatsapp_cloud_config` do tenant (precisa `phone_number_id`, `access_token`, status `conectado`)
   - Se `status != 'conectado'` → retornar erro 400

3. **Buscar campanha**:
   - Validar `canal = 'whatsapp_cloud'` e `template_id` presente
   - Carregar `template_components` e `template_variaveis` (já snapshotados na criação — assim mudanças posteriores no template não afetam a campanha em andamento)

4. **Para cada destinatário pendente**:
   - Resolver variáveis: trocar `{nome}` / `{telefone}` / etc. pelos valores reais do contato
   - Construir payload Cloud API:
     ```json
     {
       "messaging_product": "whatsapp",
       "to": "<E.164>",
       "type": "template",
       "template": {
         "name": "<template_name>",
         "language": { "code": "<template_language>" },
         "components": [
           { "type": "header", "parameters": [...] },
           { "type": "body", "parameters": [...] }
         ]
       }
     }
     ```
   - POST `https://graph.facebook.com/v21.0/<phone_number_id>/messages` com `Authorization: Bearer <access_token>`
   - Capturar `messages[0].id` da resposta → salvar em `campanha_destinatarios.wa_message_id`
   - Status inicial = `sent` (será atualizado pelo webhook para `delivered` / `read` / `failed`)

5. **Tratamento de erro**:
   - 4xx da Meta → marcar `falha` + salvar `delivery_error` com `code` e `message` da Meta
   - Erros comuns a tratar de forma amigável: template `PAUSED`/`DISABLED`, `recipient_phone_number` inválido, rate limit

6. **Registrar no módulo Conversas** (igual a `enviar-campanha`): cria/reutiliza conversa, insere `mensagens` com `tipo='template'`, `metadata.fromCampanha`, `metadata.wa_message_id` para o status update fluir naturalmente

7. **Loop de continuação**: idêntico ao Z-API (delay entre envios + chain via fetch)

### Roteamento na UI
Em `enviarCampanha()` do `Campanhas.tsx`:
```ts
const fn = campanhaCanal === "whatsapp_cloud" 
  ? "enviar-campanha-cloud" 
  : "enviar-campanha";
await supabase.functions.invoke(fn, { body: { campanha_id } });
```

---

## Frente 4 — Webhook: casar status com destinatários

Em `whatsapp-cloud-webhook/index.ts`, na função `processStatusUpdate`, depois de atualizar `mensagens`:

```ts
// Try matching against campaign recipients too
await serviceClient
  .from("campanha_destinatarios")
  .update({
    status_entrega: novoStatus,
    status_entrega_at: new Date().toISOString(),
    delivery_error: novoStatus === "failed" ? errorPayload : null,
  })
  .eq("wa_message_id", wa_message_id)
  .eq("tenant_id", tenantId);
```

Mantém a mesma lógica de **não-regressão** já implementada (read > delivered > sent).

---

## Frente 5 — Avisos de compliance e custo

Pequena seção no form de criação (canal `whatsapp_cloud`):
- Banner informativo: "Cada conversa iniciada por template é tarifada pela Meta conforme a categoria (Marketing / Utility / Authentication). Verifique seu painel WABA."
- Checkbox obrigatório: "Confirmo que os destinatários deram opt-in para receber mensagens" (já decidido na conversa anterior)
- Aviso quando categoria do template = `MARKETING`: "Esta categoria tem custo mais alto e está sujeita a limites de frequência por usuário."

---

## Frente 6 — Realtime + UX polish

1. Habilitar realtime em `campanha_destinatarios` (já tem RLS — só precisa de `ALTER PUBLICATION`)
2. No detalhe da campanha, contadores atualizam ao vivo conforme webhooks chegam
3. Botão "Reenviar falhas" no detalhe — cria novos destinatários `pendente` a partir dos `falha`
4. Exportar destinatários em CSV (status + erro) — útil para auditoria

---

## Ordem de implementação sugerida (1 sprint)

1. **Migration** (campanhas + destinatarios + canal enum)
2. **Edge function `enviar-campanha-cloud`** (sem UI ainda — testável via curl)
3. **Webhook**: linkar status com `campanha_destinatarios`
4. **UI**: tab "WhatsApp Oficial", select de template, mapeamento de variáveis, validações
5. **Detalhe**: métricas sent/delivered/read/failed + realtime
6. **Compliance**: banners de opt-in e aviso de custo
7. **Polish**: reenviar falhas + export CSV

---

## Pontos que valem confirmação antes de começar

- **Rate limit / atraso entre envios**: a Cloud API tem tiers (250, 1k, 10k, 100k conversas iniciadas/24h). Mantemos o `atraso_tipo` configurável igual ao Z-API ou queremos remover (já que a Meta mesmo limita)?
- **Mídia em template header**: header pode ser texto, imagem, vídeo ou documento. Vale suportar header com mídia já no Sprint 1, ou só texto inicialmente?
- **Reenviar falhas automaticamente**: criar agora ou deixar para um sprint futuro?

Posso começar pelas frentes 1, 2 e 3 nessa ordem assim que aprovar.
