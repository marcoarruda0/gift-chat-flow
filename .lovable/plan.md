

# Próximas etapas — WhatsApp Oficial (Cloud API)

A fase 1 entregou: configuração de credenciais por empresa, webhook validado pela Meta e botão de teste enviando `hello_world`. A partir daqui, são 4 fases incrementais — cada uma desbloqueia um pedaço do uso real. Recomendo executar **na ordem abaixo**, validando cada uma antes da próxima.

## Fase 2 — Receber mensagens reais nas Conversas (PRIORIDADE)

Hoje o webhook só loga. Sem isso, nenhuma resposta de cliente aparece na plataforma.

**Banco**:
- Adicionar coluna `canal` em `conversas` (`'zapi' | 'whatsapp_cloud'`, default `'zapi'`) pra distinguir origem de cada conversa
- Adicionar `whatsapp_cloud_phone_id` em `conversas` pra saber qual número oficial recebeu (suporte futuro a múltiplos números)

**Edge function `whatsapp-cloud-webhook`** (expandir):
- Parsear payload da Meta (estrutura `entry[].changes[].value.messages[]`)
- Tipos suportados: `text`, `image`, `audio`, `video`, `document`, `interactive` (botões/listas)
- Pra mídia: baixar via Graph API (`/{media_id}` → URL temporária → download → upload pro bucket `chat-media`)
- Find-or-create de `contatos` (por telefone E.164) e `conversas` (com `canal='whatsapp_cloud'`)
- Inserir em `mensagens` com `metadata.wa_message_id` pra dedup
- Processar `statuses[]` (sent/delivered/read/failed) e atualizar `metadata` da mensagem original
- Disparar fluxos e IA igual ao `zapi-webhook` faz hoje (reaproveitar lógica)

## Fase 3 — Enviar mensagens livres do chat (janela 24h)

Permite responder do `ChatPanel` quando o cliente já enviou algo nas últimas 24h (regra da Meta).

- `ChatPanel.tsx` recebe a `conversa.canal` como prop
- Função `onSend` decide: `canal='zapi'` → `zapi-proxy`; `canal='whatsapp_cloud'` → `whatsapp-cloud-proxy` com body `{ type: 'text', text: { body } }`
- Envio de áudio/imagem/documento via Graph API: upload prévio em `/{phone_number_id}/media`, depois `messages` referenciando o `media_id` retornado
- Indicador visual no header do chat: badge "Oficial" quando `canal='whatsapp_cloud'`
- Bloqueio de UI quando fora da janela 24h (última msg do contato > 24h) com aviso "Use um template aprovado"

## Fase 4 — Gestão de templates aprovados

Templates são obrigatórios pra iniciar conversa fora da janela 24h e pra campanhas.

**Nova página `src/pages/WhatsappTemplates.tsx`**:
- Lista templates do WABA via proxy: `GET /{waba_id}/message_templates` (usar `useWabaId: true` que o proxy já suporta)
- Mostra: nome, idioma, categoria (MARKETING/UTILITY/AUTHENTICATION), status (APPROVED/PENDING/REJECTED), corpo do template com placeholders `{{1}}`, `{{2}}`
- Botão "Testar" envia o template com variáveis preenchidas pra um número de teste
- (Opcional) Botão "Criar template" submetendo via `POST /{waba_id}/message_templates` pra aprovação Meta

**Cache local** opcional: tabela `whatsapp_cloud_templates` com `synced_at` pra evitar bater na Graph API toda vez.

## Fase 5 — Campanhas via Cloud API

Hoje `enviar-campanha` só usa Z-API. Pra campanhas oficiais é obrigatório template aprovado.

**UI Campanhas (`src/pages/Campanhas.tsx`)**:
- Quando canal = `whatsapp`, novo subseletor: "Z-API (não-oficial)" ou "WhatsApp Oficial"
- Se "Oficial": dropdown de templates aprovados (vindos da Fase 4) + inputs pra cada variável `{{N}}` com suporte a `{nome}`, `{telefone}` etc.
- Esconder editor de texto livre (não permitido sem template)

**Edge function `enviar-campanha`** (expandir):
- Decidir provider pelo campo da campanha (`provider: 'zapi' | 'whatsapp_cloud'`)
- Se `whatsapp_cloud`: substituir variáveis do contato nos componentes do template e chamar `whatsapp-cloud-proxy` com `{ type: 'template', template: { name, language, components } }`
- Mesmo padrão chunked + delay já existente

## Resumo do que cada fase desbloqueia

| Fase | Desbloqueia |
|---|---|
| 2 — Receber | Conversas reais entrando, fluxos/IA respondendo no canal oficial |
| 3 — Enviar livre | Atendentes respondendo do chat dentro da janela 24h |
| 4 — Templates | Visibilidade dos templates aprovados + testes individuais |
| 5 — Campanhas | Disparo em massa oficial (Marketing/Utility) |

## Recomendação

Começar pela **Fase 2** agora — é o maior gap funcional (sem ela o canal oficial é só envio one-shot). Posso implementá-la inteira em uma rodada e você testa enviando uma mensagem do seu celular pro número oficial pra ver aparecer em Conversas.

