

# Diagnóstico Completo: TESTE8 — Mesmo Problema

## O que aconteceu (timeline exata)

```text
22:22:20  Boot — 1ª invocação (frontend)
22:22:22  Msg 1 enviada OK → Response 200 (2.3s)
22:22:22  "Triggering next invocation immediately (1 remaining)"
22:22:22  Boot — 2ª invocação (internal)
22:22:22  "Waiting 251s before next send..."
22:24:52  ⛔ 504 Gateway Timeout (150.1s de execução)
22:25:39  Shutdown — função morta
```

**Resultado**: 1/2 enviado, 1 pendente, status travado em "enviando".

## Causa raiz

A correção anterior (mover o `await sleep()` para o início) resolve o **idle timeout** mas **não resolve o gateway timeout**. O proxy HTTP do Supabase corta qualquer resposta que demore mais de ~150s. Com `muito_longo` (180-300s), o delay **sempre** excede esse limite.

## Solução definitiva: Dividir delay em chunks de 120s

Em vez de um único `await sleep(251s)`, fazer sleep em pedaços de no máximo **120 segundos**. A cada chunk, a função verifica se foi cancelada. Isso garante que o tempo total de sleep pode ser qualquer valor, enquanto cada invocação individual não excede o gateway timeout.

**Porém**, o problema real é que o gateway mata a invocação inteira (não só o sleep). A solução correta é:

### Abordagem: Responder ANTES de dormir

A função deve **retornar a resposta HTTP imediatamente** e usar o tempo restante antes do idle timeout (~150-197s) para delays menores. Para delays maiores que ~120s, a função deve se **auto-invocar em cadeia** sem delay algum, passando o tempo restante como parâmetro, e cada invocação dorme apenas até ~120s.

```text
Fluxo para delay de 251s:
  1ª auto-invocação: sleep(120s) → auto-invoca com remaining_delay=131s
  2ª auto-invocação: sleep(120s) → auto-invoca com remaining_delay=11s  
  3ª auto-invocação: sleep(11s)  → processa destinatário → auto-invoca próximo
```

### Implementação em `enviar-campanha/index.ts`

1. Adicionar parâmetro `remaining_delay_ms` ao body da requisição
2. No início de chamadas internas:
   - Se `remaining_delay_ms > 0`: dormir `min(remaining_delay_ms, 120000)`, depois:
     - Se ainda sobrou delay: auto-invocar com `remaining_delay_ms - dormido` e retornar
     - Se delay zerou: processar normalmente
3. Ao disparar a próxima invocação: calcular o delay total e passar como `remaining_delay_ms`
4. Cada invocação individual leva no máximo ~122s (120s sleep + 2s overhead), dentro do limite de 150s do gateway

### Código chave

```typescript
if (internal) {
  let remainingDelay = remaining_delay_ms ?? 0;
  
  if (remainingDelay <= 0) {
    // Calculate fresh delay for this recipient
    const [min, max] = ATRASO_RANGES[campanha.atraso_tipo] || ATRASO_RANGES.medio;
    remainingDelay = min + Math.random() * (max - min);
  }
  
  const MAX_SLEEP = 120000; // 120s — safe under 150s gateway limit
  
  if (remainingDelay > 0) {
    const sleepTime = Math.min(remainingDelay, MAX_SLEEP);
    await new Promise(r => setTimeout(r, sleepTime));
    remainingDelay -= sleepTime;
    
    // Check cancellation
    const { data: fresh } = await serviceClient
      .from("campanhas").select("status").eq("id", campanha_id).single();
    if (fresh?.status === "cancelada") return response("Cancelada");
    
    if (remainingDelay > 0) {
      // Still more delay — chain to self with remaining time
      fetch(functionUrl, { body: { campanha_id, internal: true, remaining_delay_ms: remainingDelay } });
      return response("Delay in progress");
    }
  }
  
  // Delay completed — process recipient below
}
```

## Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/enviar-campanha/index.ts` | Implementar delay em chunks de 120s com auto-invocação em cadeia |

## Por que funciona

- Cada invocação individual leva no máximo ~122s — dentro do limite de 150s do gateway
- O delay total pode ser qualquer valor (1s a 300s) — dividido em pedaços seguros
- Verificação de cancelamento a cada chunk
- Sem mudanças no banco de dados

