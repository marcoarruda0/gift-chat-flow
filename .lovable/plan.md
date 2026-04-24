# Plano: fazer a conversa do WhatsApp Oficial aparecer em /conversas

## Diagnóstico confirmado

A tela `/conversas` não está escondendo o canal oficial.

O que confirmei:
- A query da página busca **todas** as conversas do tenant, incluindo o campo `canal`
- A resposta de rede atual traz apenas conversas com `canal = 'zapi'`
- No banco, hoje existem **0 conversas** com `canal = 'whatsapp_cloud'`
- No banco, hoje existem **0 mensagens** ligadas a conversas `whatsapp_cloud`
- Existe configuração salva em `whatsapp_cloud_config`, com verificação registrada, mas `ultima_mensagem_at` ainda está nula
- Não há logs recentes do backend `whatsapp-cloud-webhook` neste ambiente

Conclusão: o problema não está na listagem da UI; a conversa não aparece porque **nenhuma conversa do canal oficial foi persistida nesse backend ainda**.

## O que vou fazer

### 1. Validar e reativar o backend do webhook oficial
- Revisar a função `whatsapp-cloud-webhook`
- Garantir que a versão atualmente deployada seja a mesma do código do projeto
- Confirmar que qualquer POST da Meta esteja sendo registrado como atividade
- Confirmar que payloads com `messages[]` realmente criem:
  - contato
  - conversa com `canal = 'whatsapp_cloud'`
  - mensagem inicial

### 2. Fortalecer o diagnóstico para não depender de suposição
- Registrar com clareza no backend:
  - último POST recebido
  - tipo do evento recebido (`messages` vs `statuses`)
  - `phone_number_id` recebido
  - eventual erro de processamento
- Se necessário, ajustar o card de diagnóstico para mostrar “houve POST, mas nenhuma conversa foi criada”

### 3. Validar o fluxo ponta a ponta
Depois do ajuste:
1. Confirmar que o webhook recebe o evento real
2. Confirmar que a função encontra a configuração pelo `phone_number_id`
3. Confirmar criação de `contatos`, `conversas` e `mensagens`
4. Reabrir `/conversas` e verificar a nova conversa aparecendo na lista

## Arquivos envolvidos

- `supabase/functions/whatsapp-cloud-webhook/index.ts`
- `src/pages/WhatsappOficialConfig.tsx`
- `src/components/whatsapp-oficial/DiagnosticoCard.tsx`
- possível migration adicional apenas se faltar algum campo de diagnóstico

## Observação importante

Pelo que vi agora, a tela de Conversas já está correta. Se uma conversa `whatsapp_cloud` existir para este tenant, ela deve aparecer automaticamente. Então o foco da correção é o backend de recebimento, não a listagem.

## Detalhes técnicos

Fluxo esperado:
```text
Meta webhook POST
  -> whatsapp-cloud-webhook
  -> localizar config por phone_number_id
  -> criar/achar contato
  -> criar/achar conversa (canal=whatsapp_cloud)
  -> inserir mensagem
  -> /conversas passa a retornar esse registro
```

Ponto provável de falha atual:
```text
Webhook verificado/configurado
  -> mas POST real não está chegando neste backend, ou
  -> POST chega e não está gerando registros persistidos
```

Se você aprovar, eu sigo investigando/corrigindo exatamente essa etapa de persistência do webhook oficial.