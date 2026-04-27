## Objetivo

Cobrir 3 lacunas identificadas no fluxo de mensagens enviadas pelo celular/WhatsApp Web:

1. Webhook recebendo `phone` vazio ou em formato inesperado (DDI/DD, `@lid`, `@g.us`, `connectedPhone`).
2. UI não atualiza imediatamente quando o webhook anexa `messageId` numa mensagem já existente (porque o realtime só escuta `INSERT`).
3. Quando o webhook chega mas falha em gravar, não há forma fácil de reprocessar — só logs.

## O que será feito

### 1. Validação e normalização de telefone (`zapi-webhook`)

Criar um helper `resolveRecipientPhone(payload)` que devolve `{ raw, normalized, source, isGroup, isLid }`:

- `raw`: valor original recebido (`phone`, `chatLid`, `connectedPhone`, conforme prioridade).
- `normalized`: somente dígitos no padrão BR (E.164 sem `+`), com fallback inteligente:
  - se vier só com 8/9 dígitos → assume DDD do `connectedPhone`/tenant.
  - se vier sem DDI 55 e tiver 10/11 dígitos → prepend `55`.
  - se vier `@g.us` → mantém como group id.
  - se vier `@lid` → mantém como `chatLid`, `normalized = null`, e tenta casar contato pelo `chatLid` salvo em `metadata`.
- `source`: `"phone" | "chatLid" | "connectedPhone"`.

Mudanças no fluxo:

- Para `fromMe:true`, se `payload.phone` estiver vazio, cair em `chatLid` → `connectedPhone` (último é o número do dono da conta, então NÃO usar como destinatário; só serve para detectar DDI/DDD do tenant).
- Logar sempre `{ raw, normalized, source }` para diagnóstico.
- Salvar em `mensagens.metadata`: `{ phoneRaw, phoneNormalized, phoneSource, chatLid }` para auditoria.
- Se a normalização falhar (`normalized` nulo e sem `chatLid` mapeável), gravar a mensagem mesmo assim numa "fila de pendentes" lógica: insere com `metadata.pending_reason = "phone_unresolved"` em uma conversa nova de placeholder ligada a um contato `unknown-<hash>`, para o admin reprocessar manualmente. (Evita perder mensagem.)

### 2. Realtime de UPDATE de mensagens (`Conversas.tsx`)

Hoje o canal `mensagens-realtime-${tenantId}` só escuta `INSERT`. Quando o webhook anexa `messageId` numa mensagem já existente (echo da UI) é um `UPDATE` e a tela não reflete imediatamente.

Mudanças:

- Adicionar um segundo handler `event: "UPDATE"` no mesmo canal:
  - se `new.conversa_id === selectedId`, fazer merge do registro atualizado em `mensagens` (substituir item por id, preservar ordem).
  - chamar `fetchConversas()` para refletir `ultimo_texto`/`ultima_msg_at`.
- Ao inserir na UI (`handleSend`, áudio, anexo), guardar `localStatus: "pending"` no `metadata` local até o webhook devolver `messageId` (aí o UPDATE atualiza para entregue). Apenas visual — não bloqueia o fluxo atual.

### 3. Botão "Reprocessar última mensagem não gravada"

Local: cabeçalho do `ChatPanel` (menu de ações da conversa) e em `ZapiConfig.tsx` como ação global "Reprocessar última pendente".

Comportamento:

- Nova edge function `zapi-reprocessar-ultima` (verify_jwt em código, scoped no tenant do usuário):
  - lê últimos N (ex.: 20) eventos do log do `zapi-webhook` via tabela auxiliar `zapi_webhook_eventos` que será criada (ver migration abaixo).
  - filtra por `tenant_id` e `processed = false` (ou `error_msg IS NOT NULL`).
  - re-executa a mesma lógica de parse/normalização/insert da função principal, refatorada num helper compartilhado `processIncomingPayload(payload)`.
  - retorna `{ reprocessed, inserted, skipped, errors }`.
- Migration nova:
  - tabela `public.zapi_webhook_eventos` (`id uuid pk`, `tenant_id uuid`, `instance_id text`, `payload jsonb`, `processed boolean default false`, `error_msg text`, `created_at timestamptz default now()`).
  - RLS: somente `admin_tenant`/`admin_master` do tenant podem `select`. `service_role` faz tudo.
- `zapi-webhook` passa a SEMPRE inserir o evento bruto em `zapi_webhook_eventos` no início, marcar `processed=true` no fim, ou gravar `error_msg` em catch.
- Frontend: botão que chama a função, mostra toast com resumo (`"3 reprocessadas, 1 erro"`).

## Arquivos envolvidos

- `supabase/functions/zapi-webhook/index.ts` — refatorar para usar `resolveRecipientPhone` e `processIncomingPayload`; gravar evento bruto em `zapi_webhook_eventos`.
- `supabase/functions/zapi-reprocessar-ultima/index.ts` — nova função.
- `src/pages/Conversas.tsx` — adicionar handler `UPDATE`, status visual pendente, botão de reprocessar no menu.
- `src/components/conversas/ChatPanel.tsx` — expor item de menu "Reprocessar última".
- `src/pages/ZapiConfig.tsx` — botão "Reprocessar pendentes".
- Migration nova: tabela `zapi_webhook_eventos` + RLS.

## Detalhes técnicos

Helper de telefone (esboço):

```ts
function resolveRecipientPhone(p: any, tenantConnectedPhone?: string) {
  const raw = p.phone || p.chatLid || "";
  const isGroup = raw.includes("@g.us");
  const isLid = raw.includes("@lid");
  if (isGroup) return { raw, normalized: raw, source: "phone", isGroup, isLid };
  if (isLid)   return { raw, normalized: null, source: "chatLid", isGroup, isLid };
  let n = raw.replace(/\D/g, "");
  if (n.length === 8 || n.length === 9) {
    const ddd = (tenantConnectedPhone || "").replace(/\D/g, "").slice(2, 4);
    if (ddd) n = "55" + ddd + n;
  } else if (n.length === 10 || n.length === 11) {
    n = "55" + n;
  }
  return { raw, normalized: n || null, source: "phone", isGroup, isLid };
}
```

Realtime UPDATE handler:

```ts
.on("postgres_changes", {
  event: "UPDATE", schema: "public", table: "mensagens",
  filter: `tenant_id=eq.${tenantId}`,
}, (payload) => {
  const upd = payload.new as any;
  if (upd.conversa_id === selectedId) {
    setMensagens(prev => prev.map(m => m.id === upd.id ? { ...m, ...upd } : m));
  }
  fetchConversas();
})
```

## Validação

1. Mandar mensagem do celular para o Felipe → log mostra `{ raw, normalized, source }` e mensagem é gravada.
2. Mandar mensagem pela UI → ao receber echo do webhook, a UI atualiza o `messageId` sem precisar recarregar.
3. Forçar payload com `phone:""` → mensagem cai em "pendentes"; clicar em "Reprocessar última" devolve toast com resultado.

Aprovando, eu implemento todos os itens (refator do webhook + função nova + migration + UI).