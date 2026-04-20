

# Plano: Reply-To por empresa + Setup de domínio Lovable + Envio real de e-mail

## Parte 1 — Reply-To por empresa

### Migration
Adicionar uma coluna em `tenants`:
```sql
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS email_reply_to text;
```

### UI — `src/pages/Empresa.tsx` (aba E-mail)
Adicionar um novo campo entre "Endereço Local" e "Assinatura":

- **Label**: "E-mail para resposta (Reply-To)"
- **Input** type=email, placeholder `pecarara.santoandre@gmail.com`
- **Helper text**: "Quando seus contatos responderem ao e-mail enviado pela campanha, a resposta vai pra esse endereço. Pode ser seu Gmail/Outlook normal."
- Atualizar `emailConfig` state + `loadTenantData` + `saveEmailConfig` para incluir `email_reply_to`

## Parte 2 — Setup do domínio Lovable

Como ainda não há domínio configurado no projeto, vou abrir o setup dialog. Após você concluir, eu sigo automaticamente com:

1. **`setup_email_infra`** — cria filas pgmq, log de envios, supressão, cron
2. **`scaffold_transactional_email`** — cria `send-transactional-email`, `handle-email-unsubscribe`, `handle-email-suppression`

## Parte 3 — Template + edge function de envio de e-mail

### Template `campaign-broadcast.tsx`
Em `supabase/functions/_shared/transactional-email-templates/campaign-broadcast.tsx`:
- Props: `subject`, `bodyHtml`, `signatureHtml`, `fromName`, `name?`
- Wrapper React Email: Body branco, Container 600px, padding, Arial
- Renderiza `bodyHtml` via `<Section dangerouslySetInnerHTML>` ⚠️ (exceção justificada: o conteúdo vem do editor do próprio dono do tenant, não de input de terceiros — é o equivalente a "rich text próprio")
- Rodapé com `signatureHtml` separado por `<Hr>`
- Registra em `registry.ts` com `previewData` realista

### Página de unsubscribe
`src/pages/EmailUnsubscribe.tsx` + rota `/unsubscribe` em `App.tsx` (padrão branded da plataforma — valida token via GET, confirma via POST).

### Edge function `enviar-campanha-email`
`supabase/functions/enviar-campanha-email/index.ts` — segue mesmo padrão chunked do `enviar-campanha`:

- Recebe `{ campanha_id, internal?, remaining_delay_ms? }`
- Auth: JWT externo / service role interno
- Busca campanha + tenant (`email_remetente_nome`, `email_remetente_local`, `email_assinatura`, **`email_reply_to`**)
- Para cada destinatário pendente (1 por invocação):
  - Substitui `{nome}`, `{email}`, `{telefone}`, `{empresa}` em `email_html` e `email_assunto`
  - Invoca `send-transactional-email`:
    ```
    templateName: 'campaign-broadcast'
    recipientEmail: dest.telefone (que armazena o email)
    idempotencyKey: `campanha-${campanha_id}-${dest.id}`
    replyTo: tenant.email_reply_to ?? null
    fromName: tenant.email_remetente_nome
    fromLocal: tenant.email_remetente_local
    templateData: { subject, bodyHtml, signatureHtml, fromName, name }
    ```
  - Marca `enviado`/`falha` em `campanha_destinatarios` e atualiza contadores
- Aplica delay (`atraso_tipo`)
- Encadeia próxima invocação; marca `concluida` no fim

### Ajustar `send-transactional-email` (gerado pelo scaffold)
Após o scaffold, vou patchar a função para aceitar e propagar opcionalmente `replyTo`, `fromName` e `fromLocal` no envelope da Lovable Email API. Esses 3 parâmetros viram override por chamada — sem isso ficamos limitados ao `From` fixo.

### Front — `src/pages/Campanhas.tsx`
Trocar o erro de `enviarCampanha` por chamada real:
```ts
if (campanhaCanal === "email") {
  await supabase.functions.invoke("enviar-campanha-email", { body: { campanha_id: campanhaId } });
} else {
  await supabase.functions.invoke("enviar-campanha", { body: { campanha_id: campanhaId } });
}
```

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| Migration | `tenants` +coluna `email_reply_to` |
| `src/pages/Empresa.tsx` | Campo Reply-To na aba E-mail |
| Setup de domínio (dialog) | Pré-requisito |
| Infra de e-mail (auto) | Filas, log, supressão, cron, unsubscribe |
| `_shared/transactional-email-templates/campaign-broadcast.tsx` (novo) | Template wrapper React Email |
| `_shared/transactional-email-templates/registry.ts` | Registrar template |
| `send-transactional-email/index.ts` | Aceitar override de `replyTo`/`fromName`/`fromLocal` |
| `enviar-campanha-email/index.ts` (novo) | Drainer da fila por canal email |
| `src/pages/EmailUnsubscribe.tsx` (novo) | Página branded de unsubscribe |
| `src/App.tsx` | Rota `/unsubscribe` |
| `src/pages/Campanhas.tsx` | `enviarCampanha` invoca função real |

## Resultado

- Cada empresa configura: nome do remetente, prefixo local do e-mail, assinatura HTML e **endereço de resposta** (que pode ser Gmail/Outlook pessoal)
- Quando o cliente responder a um e-mail da campanha, a resposta vai pro Gmail dela direto
- Envio real de e-mail funcionando via Lovable Email com fila, retry, supressão e unsubscribe automáticos

<lov-actions>
<lov-open-email-setup>Configurar domínio de e-mail</lov-open-email-setup>
<lov-suggestion message="Teste end-to-end: configure o domínio, defina Reply-To no Empresa → E-mail, crie uma campanha com {nome}, envie pra 1 contato seu e responda o e-mail pra confirmar que volta pro Gmail">Testar fluxo Reply-To completo</lov-suggestion>
<lov-suggestion message="Adicionar templates de e-mail prontos (boas-vindas, recuperação de carrinho, aniversário) selecionáveis no editor">Templates de e-mail prontos</lov-suggestion>
<lov-suggestion message="Mostrar estatísticas de entrega no detalhe da campanha (entregues, abertos, bounces) puxando do email_send_log">Métricas de entrega</lov-suggestion>
</lov-actions>
