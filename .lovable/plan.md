## Problema

O gatilho `criado` em **Comunicações de Giftback** (`supabase/functions/processar-comunicacoes-giftback/index.ts`) hoje busca movimentos com `created_at` entre **00:00 de hoje** e **00:00 de amanhã** (BRT). Como o disparo costuma rodar às 9h, isso:

- Pega só o que foi criado entre 00h–09h de hoje (perde a maior parte do dia anterior).
- Não cobre o dia útil completo do cliente.
- Pode sobrepor com uma execução anterior se o tenant tiver horário próximo da virada do dia.

## Objetivo

Para o gatilho `criado`, considerar **todos os giftbacks criados no dia anterior completo** (00:00:00 a 23:59:59.999 BRT do dia D-1), independente do horário em que o tenant configurou o disparo.

## Mudanças

### 1. `supabase/functions/processar-comunicacoes-giftback/index.ts`

Substituir a janela do bloco `if (regra.tipo_gatilho === "criado")`:

- Calcular `ontemISO = addDaysISO(hojeISO, -1)`.
- Filtrar:
  - `created_at >= ontemISO + "T00:00:00.000-03:00"` (início do dia anterior em BRT, convertido para UTC)
  - `created_at < hojeISO + "T00:00:00.000-03:00"` (início de hoje em BRT)
- Manter `status = 'ativo'` e `tipo = 'credito'`.

Como o restante do código já trabalha com BRT via `hojeISO` e `inicioDia`, a derivação será feita reutilizando o mesmo helper de fuso já usado no arquivo (timezone fixo BRT, sem horário de verão — alinhado ao restante do scheduler).

### 2. Idempotência (já existe, só validar)

A tabela `giftback_comunicacao_envios` (chave por `regra_id + movimento_id`) já evita reenvio. Com a janela passando para o dia anterior, se um tenant rodar duas vezes (ex.: por reentrega do cron), o dedupe continua valendo — não precisa mexer.

### 3. Documentação na UI (opcional, leve)

Em `src/components/giftback/RegraComunicacaoDialog.tsx`, ajustar o helper-text do gatilho "criado" para deixar claro:

> "Envia uma vez por giftback **criado no dia anterior**, no horário configurado."

(Pequeno texto, sem mudança de comportamento.)

## Fora de escopo

- Gatilhos `vencendo` e `expirado` continuam como estão (operam por data de `validade`, não por `created_at`).
- Modal de teste (`TestarRegraDialog`) não filtra por janela — sem alteração.
- Sem migração de banco.

## Resumo do impacto

```text
ANTES:  created_at ∈ [hoje 00:00 BRT, amanhã 00:00 BRT)   ← janela "andando" durante o dia
DEPOIS: created_at ∈ [ontem 00:00 BRT, hoje 00:00 BRT)    ← dia anterior fechado
```
