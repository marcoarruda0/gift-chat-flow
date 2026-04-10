

# Integração Z-API — WhatsApp Real via API

## Visao Geral
Conectar o sistema ao Z-API para enviar/receber mensagens reais do WhatsApp, buscar foto de perfil dos contatos, e sincronizar chats. A Z-API funciona com 3 credenciais: `instanceId`, `token` e `Client-Token`.

**Base URL**: `https://api.z-api.io/instances/{instanceId}/token/{token}/{endpoint}`

---

## Fases de Implementacao

### Fase 1 — Configuracao e Infraestrutura

**1.1 Tabela `zapi_config` (Migration)**
- Armazena configuracao Z-API por tenant: `instance_id`, `token`, `client_token` (criptografados), `webhook_url`, `status` (conectado/desconectado)
- RLS por tenant_id

**1.2 Secrets**
- Nao armazenar credenciais Z-API como secrets globais — cada tenant tem suas proprias credenciais salvas na tabela `zapi_config`

**1.3 Pagina de Configuracao Z-API (`/configuracoes/zapi`)**
- Formulario para inserir Instance ID, Token e Client-Token
- Botao "Testar Conexao" (chama status da instancia)
- Botao "Configurar Webhooks" (registra URLs automaticamente)

### Fase 2 — Edge Functions (Backend)

**2.1 `zapi-proxy` (Edge Function)**
- Proxy seguro para todas as chamadas a Z-API
- Recebe: `{ tenantId, endpoint, method, body }`
- Busca credenciais do tenant na tabela `zapi_config`
- Faz a requisicao a Z-API e retorna resposta
- Endpoints suportados:
  - `GET /contacts` — listar contatos WhatsApp
  - `GET /profile-picture?phone=55...` — foto de perfil
  - `POST /send-text` — enviar mensagem de texto `{ phone, message }`
  - `GET /chats` — listar chats ativos
  - `GET /chat-messages/{phone}` — mensagens de um chat

**2.2 `zapi-webhook` (Edge Function)**
- Recebe webhooks POST da Z-API (mensagens recebidas, status, delivery)
- Identifica o tenant pelo instanceId no payload
- Para mensagens recebidas:
  - Busca/cria contato pelo telefone
  - Busca/cria conversa aberta para o contato
  - Insere mensagem na tabela `mensagens` com remetente = "contato"
  - Atualiza `ultimo_texto` e `nao_lidas` na conversa
- Para status updates: atualiza metadata da mensagem (entregue, lido)

### Fase 3 — Envio de Mensagens via WhatsApp

**3.1 Atualizar `ChatPanel` / `ChatInput`**
- Ao enviar mensagem, chamar edge function `zapi-proxy` com `send-text`
- Incluir telefone do contato (ja disponivel em `contatoTelefone`)
- Salvar mensagem localmente E enviar via Z-API simultaneamente
- Indicador visual de status: enviando → enviada → entregue → lida

**3.2 Atualizar `Conversas.tsx`**
- No `handleSend`, alem de inserir no banco, chamar `zapi-proxy/send-text`

### Fase 4 — Foto de Perfil nos Contatos

**4.1 Coluna `avatar_url` na tabela `contatos`** (Migration)
- Adicionar coluna `avatar_url text` nullable

**4.2 Buscar foto de perfil**
- Edge function `zapi-proxy` com endpoint `profile-picture?phone={phone}`
- Ao criar/editar contato com telefone, buscar foto automaticamente
- Cache a URL no campo `avatar_url`

**4.3 Exibir avatar**
- `ConversaItem.tsx` — mostrar foto ao inves de iniciais quando disponivel
- `ChatPanel.tsx` — foto no header
- `Contatos.tsx` — coluna avatar na tabela

### Fase 5 — Sincronizar Chats do WhatsApp

**5.1 Funcao "Importar Chats"**
- Botao na pagina de Conversas: "Sincronizar WhatsApp"
- Chama `zapi-proxy/chats` para listar todos os chats
- Para cada chat: cria contato (se nao existe) e conversa
- Opcional: importar ultimas mensagens de cada chat

---

## Arquivos a criar/editar

| Arquivo | Descricao |
|---------|-----------|
| Migration SQL | Tabela `zapi_config` + coluna `avatar_url` em contatos |
| `supabase/functions/zapi-proxy/index.ts` | Proxy seguro para Z-API |
| `supabase/functions/zapi-webhook/index.ts` | Receptor de webhooks |
| `src/pages/ZapiConfig.tsx` | Pagina de configuracao Z-API |
| `src/pages/Conversas.tsx` | Integrar envio real via Z-API |
| `src/components/conversas/ChatPanel.tsx` | Avatar com foto, status msg |
| `src/components/conversas/ConversaItem.tsx` | Avatar com foto |
| `src/pages/Contatos.tsx` | Coluna avatar |
| `src/App.tsx` | Rota `/configuracoes/zapi` |

## Ordem de implementacao sugerida
1. **Fase 1** — Config + tabela (base para tudo)
2. **Fase 2** — Edge functions (proxy + webhook)
3. **Fase 3** — Envio de mensagens (valor imediato)
4. **Fase 4** — Fotos de perfil (visual)
5. **Fase 5** — Sync de chats (complementar)

Cada fase e independente e pode ser implementada e testada separadamente. Sugiro comecarmos pela **Fase 1 + 2** juntas (config + edge functions), pois sao pre-requisito para tudo.

