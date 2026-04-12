

# Correção: Timeout no Atraso Inteligente de Campanhas

## Diagnóstico

A campanha **TESTE5** ficou travada em "enviando" com 1 de 2 mensagens enviadas. Causa: a edge function `enviar-campanha` processa todos os destinatários em um único loop com `setTimeout`. O atraso `muito_longo` (180-300s) excede o timeout da edge function (~150s), então a função morre antes de enviar o segundo destinatário.

## Solução: Auto-invocação recursiva

Em vez de processar todos os destinatários em um loop com sleep, a função vai:

1. Enviar **apenas 1 destinatário** por invocação
2. Após enviar, agendar a próxima invocação com delay via `setTimeout` + `fetch` para si mesma
3. Cada invocação leva poucos segundos (envio + update no banco), bem dentro do limite

```text
Fluxo atual (quebrado):
  invoke → [msg1] → sleep 300s → [msg2] → TIMEOUT ❌

Novo fluxo:
  invoke → [msg1] → respond "iniciado"
  ...após delay aleatório...
  auto-invoke → [msg2] → respond
  ...após delay aleatório...
  auto-invoke → [msg3] → marcar concluída ✅
```

## Alterações

### `supabase/functions/enviar-campanha/index.ts`

- Remover o loop `for` que itera todos os destinatários
- Buscar apenas **1 destinatário pendente** (`LIMIT 1`)
- Enviar a mensagem desse destinatário
- Se houver mais pendentes, agendar re-invocação da própria função após o delay calculado (usando `setTimeout` + `fetch` em background, **sem await** para não bloquear o response)
- Se não houver mais pendentes, marcar campanha como "concluída"
- A primeira invocação (vinda do frontend) envia imediatamente; as auto-invocações subsequentes já terão o delay embutido
- Usar `SUPABASE_URL` + path da função + `SUPABASE_SERVICE_ROLE_KEY` como Bearer token para as auto-invocações (bypass de auth para chamadas internas)
- Adicionar um campo `internal` no body para diferenciar chamadas do frontend vs auto-invocações

### `src/pages/Disparos.tsx`

- Nenhuma alteração necessária no frontend — a interface permanece igual
- O `enviarCampanha` já chama `supabase.functions.invoke` e faz poll com `setTimeout(fetchCampanhas, 2000)`

## Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/enviar-campanha/index.ts` | Refatorar para processar 1 destinatário por invocação com auto-chamada recursiva |

## Detalhe técnico do delay

O delay é feito assim: após enviar 1 mensagem, a função calcula o delay aleatório e usa `setTimeout` para disparar um `fetch` à própria URL após esse tempo. A resposta HTTP é retornada imediatamente ao chamador (frontend ou auto-invocação anterior). Isso mantém cada invocação dentro do timeout.

Para garantir que o `setTimeout` execute antes da função encerrar, usamos o padrão de background task do Deno com `EdgeRuntime.waitUntil` ou simplesmente não fazemos `await` no fetch — a plataforma Deno mantém a função viva até o timer disparar, pois timers pendentes impedem o encerramento do processo.

