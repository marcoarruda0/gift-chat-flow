

# Plano: Adicionar WhatsApp Cloud API (oficial) ao lado do Z-API

## Visão geral

Cada empresa terá agora **dois canais WhatsApp coexistindo**: Z-API (não-oficial, atual) e Cloud API (oficial, novo). A nova aba "WhatsApp Oficial" em Empresa permite cadastrar credenciais Meta, e um botão de teste envia o template `hello_world` pra validar tudo end-to-end.

Esta primeira fase entrega: **configuração + envio de template de teste + webhook recebendo mensagens (sem ainda integrar nas conversas)**. Integração com Conversas/Campanhas/Fluxos vem em fases seguintes, depois que você validar que recebe e envia.

## Parte 1 — Banco de dados

Nova tabela `whatsapp_cloud_config` (paralela à `zapi_config`, mesma estrutura de RLS por tenant):

```text
whatsapp_cloud_config
├── id uuid PK
├── tenant_id uuid (unique — 1 config por empresa)
├── phone_number_id text       (ex: 1057954850740861)
├── waba_id text               (WhatsApp Business Account ID)
├── access_token text          (token permanente do System User)
├── verify_token text          (gerado random pelo sistema, usado no webhook)
├── display_phone text         (número formatado, ex: +55 11 99999-9999, opcional)
├── status text default 'desconectado'  ('desconectado' | 'conectado' | 'erro')
├── ultimo_teste_at timestamptz
├── ultimo_erro text
├── created_at, updated_at
```

RLS espelhando `zapi_config`: SELECT por tenant, INSERT/UPDATE/DELETE por admin do tenant.

## Parte 2 — Edge functions novas

### `whatsapp-cloud-proxy` (envio + teste)
Análoga ao `zapi-proxy`, mas pra Graph API:
- Recebe `{ endpoint, method, data }` do front (autenticado por JWT)
- Resolve credenciais via service role na `whatsapp_cloud_config` do tenant do usuário
- Faz `fetch` em `https://graph.facebook.com/v21.0/{phone_number_id}/{endpoint}` com `Authorization: Bearer {access_token}`
- Endpoint principal usado pela UI: `messages` (POST) → envia template `hello_world` pra um número que o user digita
- Retorna a resposta crua da Meta pra exibir no toast (ID da mensagem ou erro)

### `whatsapp-cloud-webhook` (recebimento, **sem integração com conversas ainda**)
- `GET`: validação inicial — compara `hub.verify_token` da query com o `verify_token` salvo na config (busca match em qualquer tenant); responde `hub.challenge` se bater
- `POST`: recebe payload da Meta. Nesta fase: **só loga** (`console.log` estruturado) e responde 200. Isso já valida que o webhook está recebendo. Integrar mensagens recebidas em `mensagens`/`conversas` fica pra fase 2.
- `verify_jwt = false` em `supabase/config.toml` (Meta não envia JWT)

## Parte 3 — UI

### Nova página `src/pages/WhatsappOficialConfig.tsx`
Réplica visual do padrão de `ZapiConfig.tsx`, com:

- **Card "Credenciais"**: 4 inputs (Phone Number ID, WABA ID, Access Token, Display Phone opcional) + Save
- **Card "Webhook"**: mostra `Callback URL` (read-only, copiável) = `https://{project_ref}.supabase.co/functions/v1/whatsapp-cloud-webhook` e `Verify Token` (read-only, copiável, gerado random no primeiro save)
- **Card "Testar envio"**: input "Número destino" (E.164, ex: `5511999999999`) + botão "Enviar template hello_world"
  - Chama `whatsapp-cloud-proxy` com `endpoint: 'messages'`, body equivalente ao curl do usuário
  - Toast de sucesso com `messages[0].id` ou erro com mensagem da Meta
  - Atualiza `ultimo_teste_at` e `status` na config
- **Helper text** no topo explicando: "Antes de testar, configure o webhook na Meta App Dashboard com a Callback URL e Verify Token acima, e assine os campos `messages` e `message_status`."

### Roteamento
`src/App.tsx` → adicionar rota `/configuracoes/whatsapp-oficial` apontando pra nova página (mesma proteção de auth das outras configs).

### Navegação em Empresa → WhatsApp
Em `src/pages/Empresa.tsx`, na aba/seção que hoje lista instâncias Z-API (linha ~206), adicionar abaixo um bloco "WhatsApp Oficial (Cloud API)" com botão "Configurar" que leva a `/configuracoes/whatsapp-oficial`. Z-API permanece intocado.

## Parte 4 — Verify Token

No primeiro save da config, se `verify_token` estiver vazio, o front gera `crypto.randomUUID().replace(/-/g, '')` (32 hex chars) e envia junto. Já fica disponível pra copiar no card de Webhook.

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| Migration nova | Criar tabela `whatsapp_cloud_config` + RLS + trigger updated_at |
| `supabase/functions/whatsapp-cloud-proxy/index.ts` (novo) | Proxy autenticado pra Graph API |
| `supabase/functions/whatsapp-cloud-webhook/index.ts` (novo) | GET verify + POST log |
| `supabase/config.toml` | Bloco `[functions.whatsapp-cloud-webhook] verify_jwt = false` |
| `src/pages/WhatsappOficialConfig.tsx` (novo) | UI completa de config + teste |
| `src/App.tsx` | Rota `/configuracoes/whatsapp-oficial` |
| `src/pages/Empresa.tsx` | Bloco "WhatsApp Oficial" abaixo do bloco Z-API |

## Fora do escopo desta fase (próximos passos depois do teste passar)

1. **Receber mensagens nas Conversas**: webhook cria/atualiza `conversas` e `mensagens` quando vier mensagem real do cliente — exige campo `canal` em `conversas` ou `instancia_origem` pra distinguir Z-API vs Cloud API
2. **Enviar mensagens livres do chat (janela 24h)**: ChatPanel detecta canal da conversa e usa o proxy correto
3. **Templates aprovados**: tela de gestão (listar via Graph API `{waba_id}/message_templates`, enviar template selecionado nas Campanhas)
4. **Campanhas via Cloud API**: `enviar-campanha` decide entre `zapi-proxy` ou `whatsapp-cloud-proxy` por config do tenant

## O que você precisa fazer depois que eu implementar

1. Acessar **Empresa → WhatsApp Oficial → Configurar**
2. Colar Phone Number ID (`1057954850740861`), WABA ID, Access Token e salvar
3. Copiar **Callback URL** e **Verify Token** que vão aparecer
4. Na **Meta App Dashboard → WhatsApp → Configuration**, colar essas duas strings, clicar Verify, e assinar `messages` + `message_status`
5. Voltar pra UI, digitar seu número de teste e clicar "Enviar template hello_world"

