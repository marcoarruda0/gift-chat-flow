
# 🎯 Melhorias: expiração automática + validações robustas no Caixa

## Parte 1 — Job de expiração de giftbacks (cron)

### 🔧 Edge function `expirar-giftbacks`
Arquivo: `supabase/functions/expirar-giftbacks/index.ts`

Lógica (com **service role key**, sem dependência de tenant logado):
1. Buscar todos `giftback_movimentos` com `tipo='credito'`, `status='ativo'` e `validade < hoje` (data UTC).
2. Para cada batch (até 1000 por vez):
   - `UPDATE giftback_movimentos SET status='expirado', motivo_inativacao='expirado' WHERE id IN (...)`.
   - Coletar `contato_id` distintos.
3. Para cada `contato_id` afetado: `UPDATE contatos SET saldo_giftback = 0` (após expirar, por definição da regra "1 ativo por cliente", o saldo agregado vira 0 — não há outro ativo possível pelo índice único).
4. Retornar JSON com `{ expirados: N, contatos_zerados: M, executado_em }`.

Implementação:
- Importar `createClient` de `npm:@supabase/supabase-js@2`.
- Usar `Deno.env.get("SUPABASE_URL")` e `SUPABASE_SERVICE_ROLE_KEY`.
- CORS headers padrão (apesar de ser chamada por cron, deixa testável manualmente).
- Sem `verify_jwt` na config (executa anônimo via cron com Bearer anon key, mas valida via service role internamente). Adicionar bloco em `supabase/config.toml`:
  ```toml
  [functions.expirar-giftbacks]
  verify_jwt = false
  ```

### ⏰ Agendamento via pg_cron
Como a SQL contém URL do projeto + anon key (dados sensíveis específicos do tenant), **NÃO usar migration**. Em vez disso, usar a tool `supabase--insert` no momento da execução:

```sql
-- Habilitar extensões (idempotente)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Agendar 1x por dia às 03:00 UTC (00:00 BRT)
select cron.schedule(
  'expirar-giftbacks-daily',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://ywcgburxzwukjtqxuhyr.supabase.co/functions/v1/expirar-giftbacks',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

> ⚠️ Como esse SQL contém a anon key real do projeto, será executado via `supabase--insert` (não via migration), conforme regra do sistema.

### 🔁 Coexistência com o lazy-expire
- O lazy-expire em `GiftbackCaixa.buscarContato` **continua existindo** como rede de segurança (defesa em profundidade) caso o cron atrase ou falhe.
- O cron garante que `saldo_giftback` em relatórios, dashboards e segmentações fique correto mesmo sem ninguém abrir o caixa.

---

## Parte 2 — Hardening de validações no Caixa

Arquivo: `src/pages/GiftbackCaixa.tsx`

### Estado atual já cobre
- `regrasInvalidas[]` bloqueia quando multiplicador/percentual/validade são inválidos.
- `podeConfirmar` exige `valorCompraNum > 0`.
- `registrarMutation` revalida regras e valor antes do INSERT.

### O que falta (foco do request)

#### 2.1 Validação rigorosa do valor da compra
Substituir o `parseFloat` solto por uma função utilitária local:

```ts
function parseValorCompra(raw: string): { valor: number; erro: string | null } {
  const limpo = raw.trim().replace(",", ".");
  if (!limpo) return { valor: 0, erro: null }; // vazio = sem erro ainda
  const n = Number(limpo);
  if (!Number.isFinite(n)) return { valor: 0, erro: "Valor inválido (não é um número)." };
  if (n < 0) return { valor: 0, erro: "Valor da compra não pode ser negativo." };
  if (n === 0) return { valor: 0, erro: "Valor da compra deve ser maior que zero." };
  if (n > 1_000_000) return { valor: 0, erro: "Valor acima do limite permitido (R$ 1.000.000)." };
  // Limite a 2 casas decimais — evitar lixo tipo 12.345678
  const arredondado = Math.round(n * 100) / 100;
  return { valor: arredondado, erro: null };
}
```

Uso:
- Substituir `const valorCompraNum = parseFloat(valorCompra) || 0` por `const { valor: valorCompraNum, erro: erroValor } = parseValorCompra(valorCompra)`.
- Renderizar `erroValor` abaixo do input numérico (mesmo padrão visual do `aviso-abaixo-minimo`, mas com `border-destructive`).
- Adicionar `erroValor` ao `podeConfirmar`: `regrasOk && valorCompraNum > 0 && !erroResgate && !erroValor`.

#### 2.2 Endurecimento do input
- Manter `type="number"` mas adicionar `inputMode="decimal"` e `onKeyDown` para bloquear `e`, `E`, `+`, `-` (HTML5 number aceita esses caracteres).
- Manter `min="0.01"` e `step="0.01"`.

#### 2.3 Bloqueio total quando regras ausentes
Hoje já bloqueia o submit, mas o input fica habilitado quando `regrasAtuais` é `null` (configGlobal ainda carregando). Adicionar guarda extra:
- Mostrar skeleton/aviso "Carregando configuração..." quando `configGlobal === undefined` (loading).
- Se `configGlobal === null` (sem registro no banco): mostrar erro vermelho "Configuração de giftback ausente. Crie em Giftback → Configuração antes de operar o caixa." e desabilitar TODO o formulário.

#### 2.4 Mutation: validações finais (defesa em profundidade)
Reforçar `registrarMutation.mutationFn` no início:
```ts
if (!profile?.tenant_id || !user?.id) throw new Error("Sessão inválida.");
if (!contato) throw new Error("Selecione um contato antes de continuar.");
if (!configGlobal) throw new Error("Configuração de giftback ausente.");
const { valor, erro: erroValor } = parseValorCompra(valorCompra);
if (erroValor) throw new Error(erroValor);
if (valor <= 0) throw new Error("Valor da compra inválido.");
// ... resto continua
```

Substituir todas as referências internas a `valorCompraNum` por `valor` validado dentro da mutation.

#### 2.5 Mensagens de erro consolidadas
Acima do botão "Confirmar Compra", quando `!podeConfirmar`, mostrar lista do que está bloqueando:
- "Configure as regras de giftback" (se `!regrasOk`)
- "Informe um valor válido" (se `erroValor` ou `valorCompraNum <= 0`)
- "Resgate inválido" (se `erroResgate`)

Bloco com `data-testid="bloqueios-confirmacao"` para futura cobertura de teste.

---

## 🧪 Testes — `src/lib/__tests__/giftback-rules.test.ts`

Adicionar nova suíte `parseValorCompra` (extrair função para `src/lib/giftback-rules.ts` para ser testável e reusável):
- `""` → `{ valor: 0, erro: null }`
- `"abc"` → erro
- `"-50"` → erro (negativo)
- `"0"` → erro (zero)
- `"NaN"` → erro
- `"1000001"` → erro (acima do limite)
- `"99,90"` (vírgula) → `{ valor: 99.9, erro: null }`
- `"12.3456"` → `{ valor: 12.35, erro: null }` (arredondado)
- `"50"` → `{ valor: 50, erro: null }`

---

## 📁 Arquivos afetados

| Tipo | Arquivo |
|---|---|
| Novo | `supabase/functions/expirar-giftbacks/index.ts` |
| Editado | `supabase/config.toml` (adicionar bloco da função) |
| SQL via insert tool (não migration) | Schedule pg_cron + pg_net |
| Editado | `src/lib/giftback-rules.ts` (exportar `parseValorCompra`) |
| Editado | `src/pages/GiftbackCaixa.tsx` (validações, bloqueios, mensagens) |
| Editado | `src/lib/__tests__/giftback-rules.test.ts` (suíte parseValorCompra) |

## ⚠️ Riscos / Notas
- O cron roda diariamente às 03:00 UTC. Se o tenant precisar de granularidade maior (ex.: a cada hora), basta ajustar o cron expression.
- A função usa service role: por design, **bypassa RLS** para varrer todos os tenants de uma vez. Garantido por `where validade < today` + tipo/status, ou seja, escopo bem delimitado.
- Limite de R$ 1.000.000 é defensivo (evita digitação acidental tipo R$ 1234567); ajustável.

## 🚫 Fora deste sprint
- Notificação automática ao cliente "seu giftback expira em X dias".
- Dashboard de auditoria mostrando quantos giftbacks foram expirados pelo job.
- Histórico/log persistido das execuções do cron (hoje só fica no log da edge function).
