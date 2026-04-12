

# Correção: setTimeout morto pelo shutdown do runtime

## Diagnóstico

O `setTimeout` com delay de 253s não funciona porque o runtime da edge function encerra (~200s idle) antes do timer disparar. O log confirma:
- 21:55:04 — "Scheduling next send in 253s"
- 21:58:21 — "shutdown" (197s depois, antes dos 253s)

O `setTimeout` **não mantém o processo vivo** no Supabase Edge Functions — após enviar a resposta HTTP, o runtime entra em idle e é encerrado.

## Solução: `pg_net` para agendamento externo

Usar a extensão `pg_net` do PostgreSQL para agendar o HTTP POST diretamente do banco de dados. O `pg_net` faz a requisição HTTP de forma assíncrona, independente do runtime da edge function.

Em vez de `setTimeout` no código TypeScript, a edge function vai chamar uma RPC que usa `net.http_post()` para agendar a próxima invocação.

## Alterações

### 1. Migration — Habilitar `pg_net` e criar função de agendamento

```sql
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.agendar_envio_campanha(
  p_campanha_id uuid,
  p_delay_seconds int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text;
  v_service_key text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/enviar-campanha',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('campanha_id', p_campanha_id, 'internal', true)
  );
END;
$$;
```

**Nota:** `pg_net` não suporta delay nativo. A alternativa é usar `pg_cron` para agendar um job one-shot, ou fazer o delay de outra forma. Porém a abordagem mais simples e confiável é:

### Abordagem revisada: Delay curto + sleep no início da invocação

Em vez de esperar *antes* de chamar a função, a edge function é chamada **imediatamente** (via `pg_net` ou `fetch` sem delay) e faz o **sleep no início** da próxima invocação.

```text
Fluxo:
  invoke → envia msg1 → responde → chama pg_net imediatamente
  → nova invoke → sleep(delay) → envia msg2 → responde → chama pg_net
  → nova invoke → sleep(delay) → envia msg3 → concluída
```

Cada invocação dorme no máximo 300s (5 min) — dentro do limite de execução (que é ~400s para chamadas ativas, o timeout de ~150s é só para idle).

### 2. Edge function `enviar-campanha/index.ts`

- Remover `scheduleNextInvocation` com `setTimeout`
- Quando há mais pendentes, fazer `fetch` imediato (sem delay) para si mesma
- No início da função, quando `internal === true`, ler o `atraso_tipo` da campanha e fazer `await new Promise(r => setTimeout(r, delay))` **antes** de processar o destinatário
- Isso mantém o runtime ativo (está processando, não idle), evitando o shutdown

```typescript
// No início, após validação:
if (internal) {
  const [delayMin, delayMax] = ATRASO_RANGES[campanha.atraso_tipo] || ATRASO_RANGES.medio;
  const delay = delayMin + Math.random() * (delayMax - delayMin);
  console.log(`Waiting ${Math.round(delay / 1000)}s before next send...`);
  await new Promise(r => setTimeout(r, delay));
}

// Depois, processar 1 destinatário normalmente

// Ao final, se houver mais pendentes:
// fetch imediato (sem setTimeout) para próxima invocação
fetch(functionUrl, { ... }).catch(console.error);
// NÃO usar await — fire and forget
```

## Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/enviar-campanha/index.ts` | Mover delay para início da invocação; fetch imediato sem setTimeout |

Sem migration necessária — a solução é puramente na edge function.

## Por que funciona

- O `setTimeout` com `await` dentro de uma requisição ativa (antes de enviar a response) mantém o runtime vivo — ele está "trabalhando", não idle
- Cada invocação leva no máximo ~5min (delay) + poucos segundos (envio), dentro do limite de execução ativa
- O `fetch` sem delay no final dispara a próxima invocação antes de responder

