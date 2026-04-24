

# Plano: Diagnóstico do Webhook WhatsApp Oficial

Confirmei via logs e banco: **a Meta nunca chamou o webhook** (zero hits, zero conversas com `canal='whatsapp_cloud'`). O código está correto — o problema é configuração na Meta App Dashboard que não dá pra você diagnosticar sem ferramenta.

## Configuração que você precisa fazer na Meta (manual, fora do código)

Na **Meta App Dashboard → seu app → WhatsApp → Configuration**:

| Campo | Valor |
|---|---|
| Callback URL | `https://ywcgburxzwukjtqxuhyr.supabase.co/functions/v1/whatsapp-cloud-webhook` |
| Verify Token | `2ae78e78e00e4ffd972cb0c752925089` |

Passos:
1. Cole os dois valores → **Verify and Save** (Meta faz GET no webhook)
2. Em **Webhook fields**, clicar **Manage** → assinar **`messages`** e **`message_status`** → **Subscribe**
3. Em **API Setup**, garantir que o número que você usa pra mandar mensagem está em **"To"** (lista de números de teste) — apps em modo Development só recebem de números cadastrados ali

Sem o passo 2 a Meta verifica a URL mas nunca envia mensagens.

## Visibilidade no painel (código)

Pra você ver em tempo real se a Meta tocou o webhook, adiciono um card "Diagnóstico do Webhook" em `WhatsappOficialConfig.tsx`.

### Banco
Migration adicionando 2 colunas em `whatsapp_cloud_config`:
- `ultima_verificacao_at timestamptz` — atualizada no GET de handshake da Meta
- `ultima_mensagem_at timestamptz` — atualizada quando entra POST com `messages[]`

### Edge function `whatsapp-cloud-webhook`
- No GET com token correto: `update whatsapp_cloud_config set ultima_verificacao_at = now() where verify_token = ?`
- No POST com `messages[]` não-vazio: `update ... set ultima_mensagem_at = now() where phone_number_id = ?`
- Manter logs detalhados (já existem)

### UI: novo card "Diagnóstico do Webhook" em `WhatsappOficialConfig.tsx`
Mostra:
- 🔴 **"Webhook nunca foi chamado pela Meta"** — se `ultima_verificacao_at IS NULL` → instrução: "Configure Callback URL + Verify Token na Meta e clique Verify and Save"
- 🟡 **"Verificado, mas sem mensagens recebidas"** — se tem verificação mas não tem mensagem → instrução: "Em Webhook fields → Manage, assine o campo `messages`. Se o app estiver em Development, adicione seu número em API Setup → To"
- 🟢 **"Recebendo mensagens normalmente"** — se tem mensagem nas últimas 24h
- Timestamps: "Última verificação: há 5 min" / "Última mensagem: há 30s"
- Contador: "Mensagens recebidas nas últimas 24h: N" (query em `mensagens` filtrando `metadata->>'wa_message_id' IS NOT NULL`)
- Botão **"Atualizar diagnóstico"** que refaz o select da config

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| Migration nova | `ALTER TABLE whatsapp_cloud_config ADD COLUMN ultima_verificacao_at timestamptz, ADD COLUMN ultima_mensagem_at timestamptz` |
| `supabase/functions/whatsapp-cloud-webhook/index.ts` | Marcar timestamps em verify (GET) + recebimento de mensagens (POST) |
| `src/pages/WhatsappOficialConfig.tsx` | Novo card "Diagnóstico do Webhook" com semáforo, timestamps e contador |

## Como vamos validar

1. Eu implemento e você abre `/configuracoes/whatsapp-oficial` — card mostra 🔴
2. Você completa Verify+Save na Meta — recarrega → 🟡 ("Última verificação: agora")
3. Você assina `messages` na Meta + adiciona seu número em "To"
4. Manda mensagem do celular → recarrega → 🟢 e a conversa aparece em `/conversas` com badge "Oficial"

Se travar em 🔴 mesmo após Verify and Save, é token/URL errados na Meta. Se travar em 🟡, é assinatura de campo `messages` ou número não autorizado.

