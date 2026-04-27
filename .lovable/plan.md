## Objetivo

Isolar com precisão por que mensagens enviadas diretamente do celular/WhatsApp Web não aparecem em `Conversas`, separando o problema entre:
- registro do webhook na Z-API,
- formato real do payload recebido,
- parser/normalização no backend,
- gravação no banco,
- atualização da UI.

## Evidências já confirmadas

- O backend está recebendo e gravando eventos `ReceivedCallback` com `fromMe:false` normalmente.
- Há registros recentes em `mensagens`, `conversas` e `zapi_webhook_eventos` para mensagens recebidas.
- Não há eventos recentes com `fromMe:true` em `zapi_webhook_eventos`.
- Também não há tipos de evento contendo `send`/`sent` gravados.
- O helper atual de telefone espera `connected_phone` em `zapi_config`, mas essa coluna não existe hoje.
- O helper atual trata `@g.us` como grupo, mas os logs mostram grupos no formato `...-group`, então parte da classificação está incorreta.

Isso indica que o fluxo base funciona para mensagens recebidas, mas o problema das mensagens enviadas do celular provavelmente está em uma destas camadas: webhook de saída não cadastrado/ativo, tipo de callback inesperado, parser incompleto, ou roteamento incorreto para contato/conversa.

## Plano de verificação

### 1. Confirmar se a Z-API está realmente enviando o callback de mensagem enviada do celular

- Validar, via proxy já existente, o estado atual dos webhooks cadastrados para:
  - recebidas,
  - enviadas pelo celular/WhatsApp Web,
  - status de entrega.
- Comparar o endpoint configurado com o webhook esperado do projeto.
- Fazer teste controlado com envio pelo celular para 3 cenários:
  - conversa individual comum,
  - conversa com `@lid`,
  - grupo.
- Verificar se algum POST chega ao backend nesses testes.

Resultado esperado:
- Se nenhum evento de saída chegar, a causa está antes do parser (cadastro/compatibilidade do webhook na Z-API).
- Se chegar, seguimos para parse e persistência.

### 2. Capturar e classificar o payload real das mensagens “fromMe”

- Auditar o payload bruto do evento de saída que vier da Z-API.
- Catalogar campos relevantes:
  - `type`, `status`, `fromMe`, `fromApi`,
  - `phone`, `participantPhone`, `chatLid`, `participantLid`,
  - `messageId`, `ids`, `text`, `message`, `body`, `conversation`,
  - `isGroup`.
- Verificar se a Z-API usa um tipo diferente do esperado para saída (ex.: callback de status sem corpo, callback de mensagem enviada com outro formato, etc.).

Resultado esperado:
- Determinar o formato exato que precisa ser suportado para mensagens enviadas fora da UI.

### 3. Verificar o parser de conteúdo e a detecção de origem

- Conferir se `parseMessageContent` cobre o formato real do payload de saída.
- Validar se eventos de saída estão sendo descartados como `skipped_no_content` mesmo contendo texto em outra chave.
- Ajustar a detecção de `isFromMe` para não depender apenas de `payload.fromMe === true` quando o provedor usar outro indicador.
- Revisar onde o `messageId` está vindo para eventos de saída, incluindo fallbacks.

Resultado esperado:
- Garantir que o backend consiga extrair conteúdo e classificar corretamente a mensagem como enviada pelo atendente.

### 4. Verificar resolução de telefone e mapeamento da conversa

- Revisar a prioridade de resolução do destinatário para mensagens enviadas pelo celular:
  - individual: `phone` -> `participantPhone` -> `chatLid/participantLid`,
  - grupo: `phone`/id do grupo + `participantPhone` para autor quando necessário.
- Corrigir a detecção de grupo para aceitar tanto `@g.us` quanto formatos `-group` vistos nos logs.
- Remover a dependência de `zapi_config.connected_phone` enquanto a coluna não existir, usando apenas `payload.connectedPhone` quando disponível.
- Validar o que fazer quando vier apenas `@lid` sem telefone numérico.

Resultado esperado:
- Identificar se a mensagem não entra porque está sendo roteada para o telefone/conversa errados, ou porque o número fica irrecuperável.

### 5. Verificar a persistência no banco ponta a ponta

- Auditar o resultado salvo em `zapi_webhook_eventos.resultado` para cada evento de saída testado.
- Classificar casos em:
  - `inserted`,
  - `echo_attached`,
  - `duplicate`,
  - `skipped_no_content`,
  - `skipped_phone_unresolved`,
  - `insert_failed`,
  - `contact_failed`,
  - `conversa_failed`.
- Confirmar se `findOrCreateContact` e `findOrCreateConversa` conseguem localizar a conversa correta para mensagens enviadas do celular.
- Verificar se há divergência entre número salvo no contato e número resolvido do webhook.

Resultado esperado:
- Saber exatamente em qual etapa o fluxo quebra quando a mensagem sai do celular.

### 6. Verificar a exibição em `Conversas`

- Confirmar se, quando a mensagem é gravada, ela aparece na lista e no painel sem reload.
- Verificar se a conversa correta está sendo atualizada com `ultimo_texto` e `ultima_msg_at`.
- Validar o realtime para `INSERT` e `UPDATE` no caso das mensagens vindas do webhook.
- Separar problema de “não gravou” versus “gravou, mas a UI não mostrou”.

Resultado esperado:
- Eliminar falso negativo de interface quando o backend já tiver salvo a mensagem.

### 7. Fortalecer diagnóstico e reprocessamento

- Melhorar a auditoria do evento bruto com motivo de descarte mais explícito.
- Permitir reprocessar um evento específico de saída, não só pendentes genéricos.
- Exibir no admin os campos originais e normalizados usados para roteamento.

Resultado esperado:
- Reduzir tentativas cegas e permitir correção rápida em casos reais.

## Entregáveis dessa rodada

1. Diagnóstico conclusivo da causa principal.
2. Lista das causas secundárias encontradas.
3. Ajustes necessários no backend para suportar o payload real.
4. Ajustes necessários na UI, se houver problema de visibilidade.
5. Estratégia de reprocessamento confiável para novos casos.

## Prioridade de investigação

1. Confirmar ausência real de callbacks `fromMe`.
2. Validar cadastro efetivo do webhook de mensagens enviadas.
3. Capturar um payload real de saída do celular.
4. Corrigir parser + resolução de telefone/grupo.
5. Validar gravação e exibição na UI.

## Detalhes técnicos

Pontos mais prováveis a serem validados primeiro:

- O webhook de “mensagens enviadas (celular/WA Web)” pode não estar ativo de fato, mesmo após o cadastro.
- A Z-API pode estar enviando o callback de saída em um tipo diferente de `ReceivedCallback`/`fromMe:true`.
- O parser atual pode descartar a mensagem por não encontrar texto na chave esperada.
- O helper de telefone hoje não cobre corretamente grupos no formato `...-group`.
- O código espera `connected_phone` em `zapi_config`, mas essa coluna não existe.
- Mesmo quando gravada, a conversa pode não ser a esperada se o telefone resolvido não bater com o contato existente.

## Critério de sucesso

Após a execução desse plano, ficará claro qual destes cenários é o verdadeiro:

- a Z-API não envia o callback de saída;
- o callback chega, mas o backend não interpreta;
- o backend interpreta, mas grava na conversa errada;
- o backend grava corretamente, mas a UI não atualiza.

Com isso, a próxima etapa já entra direto na correção certa, sem tentativa e erro.