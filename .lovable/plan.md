## Diagnóstico atual

O problema não está na tela de Conversas lendo o banco. Hoje o cenário é este:

- A conversa do Felipe existe e está sendo atualizada normalmente para mensagens recebidas.
- O banco tem mensagens do Felipe gravadas como `remetente=contato`.
- O banco também tem mensagens enviadas pelo sistema/UI como `remetente=atendente`, mas nenhuma delas tem `metadata.messageId` vindo da Z-API.
- Nos logs recentes do `zapi-webhook`, só aparecem:
  - mensagens recebidas (`fromMe: false`)
  - callbacks de status (`RECEIVED`, `READ_BY_ME`)
- Não apareceu nenhum log de `fromMe: true` nem `Message saved (atendente)`.

Conclusão: neste momento, a mensagem enviada direto do celular/WhatsApp Web não está chegando até a etapa de gravação no banco. Ou a Z-API não está disparando o evento correto, ou o payload do evento de saída vem em um formato que nossa função ainda não reconhece.

## Plano de correção

### 1. Instrumentar melhor o `zapi-webhook`

Adicionar logs estruturados antes de qualquer parse para capturar exatamente o formato real dos eventos de saída:

- `instanceId`
- `type`
- `status`
- `fromMe`
- `phone`
- `chatLid`
- `connectedPhone`
- `messageId`
- chaves disponíveis do payload

Também registrar explicitamente:

- quando o evento foi ignorado por não ter `messageContent`
- quando falhou `findOrCreateContact`
- quando falhou `findOrCreateConversa`
- quando falhou o `insert` em `mensagens`

Isso elimina a hipótese de falha silenciosa.

### 2. Tornar o parser compatível com payloads de saída

Hoje a função só salva mensagem quando encontra conteúdo em formatos como `payload.text.message`, `image`, `document`, etc.

Vou ampliar o parser para aceitar formatos alternativos que a Z-API costuma usar em eventos de mensagens enviadas, por exemplo:

- `payload.text`
- `payload.message`
- `payload.messageText`
- outros campos textuais equivalentes, se vierem no webhook real

Também vou separar claramente:

- callback de status
- mensagem com conteúdo

para não depender só do shape usado nas mensagens recebidas.

### 3. Normalizar o identificador do contato para mensagens `fromMe`

Para saída, a Z-API pode mandar combinações diferentes entre:

- `phone`
- `chatLid`
- `connectedPhone`

Vou ajustar a resolução do contato para usar a origem correta do destinatário em mensagens enviadas, evitando gravar no número errado ou não achar a conversa existente.

Fluxo esperado:

```text
Evento fromMe:true
  -> extrair destinatário real
  -> localizar/criar contato
  -> localizar/criar conversa
  -> gravar mensagem remetente=atendente
  -> atualizar ultimo_texto/ultima_msg_at
```

### 4. Persistir `messageId` nas mensagens enviadas pela própria UI

Hoje, quando a mensagem sai pelo módulo Conversas, ela é inserida no banco imediatamente, mas o retorno do `send-text` da Z-API não está sendo salvo como `metadata.messageId`.

Vou corrigir isso para:

- salvar `messageId` retornado pelo envio
- permitir correlação entre envio da UI, webhook e status de entrega
- melhorar deduplicação e rastreio

Isso não resolve sozinho o envio via celular, mas ajuda muito a diferenciar:

- mensagens enviadas pela UI
- mensagens enviadas fora do sistema
- callbacks posteriores

### 5. Validar ponta a ponta

Depois da correção:

1. registrar novamente os webhooks se necessário
2. enviar uma mensagem pelo celular para o Felipe
3. confirmar nos logs que chegou um evento `fromMe:true`
4. confirmar no banco um novo registro em `mensagens` com `remetente=atendente`
5. confirmar que a conversa sobe na lista e aparece no chat

## Arquivos envolvidos

- `supabase/functions/zapi-webhook/index.ts`
- `src/pages/Conversas.tsx`
- possivelmente `src/pages/ZapiConfig.tsx` apenas se eu precisar reforçar a validação/configuração do webhook

## Detalhes técnicos

Achados relevantes da investigação:

- `zapi-webhook` salva mensagens só quando `payload.phone && messageContent`.
- O parser atual não cobre formatos alternativos de texto de saída.
- A lista de Conversas está lendo corretamente de `conversas` e `mensagens`; não há evidência de bug de exibição no front para este caso.
- A tabela `zapi_config` já está com `webhook_url` preenchida.
- Não há registros recentes de mensagem de atendente originada por webhook.

Se você aprovar, eu implemento a instrumentação e a correção do parser/normalização para fechar o diagnóstico e resolver a gravação.