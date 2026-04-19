

# Plano: Eliminar contatos duplicados (raiz + limpeza)

## Diagnóstico

**Conversas duplicadas: NÃO existem no banco** (query `GROUP BY tenant_id, contato_id HAVING COUNT>1` retornou vazio). A `findOrCreateConversa` no webhook está correta. Se você estava enxergando "conversas duplicadas" na UI, era na verdade reflexo dos contatos duplicados (mesmo telefone aparecendo em N "contatos" diferentes, cada um com sua conversa visível em listas que fazem JOIN).

**Contatos duplicados: SIM, problema sério**. 8 telefones têm duplicatas, sendo o pior caso `5511975471989` com **105 cópias** do mesmo contato (todas com o mesmo nome, mesmo tenant, criadas ao longo de vários dias). Total: 451 contatos no banco, mas só 188 telefones únicos → ~263 linhas órfãs.

## Causa-raiz (3 bugs cumulativos)

### Bug 1 — `findOrCreateContact` no webhook usa `.single()` em vez de `.maybeSingle()`

`supabase/functions/zapi-webhook/index.ts:1184-1198`:
```ts
let { data: contato } = await supabase
  .from("contatos").select("id")
  .eq("tenant_id", tenantId).eq("telefone", phone)
  .single();   // ← lança erro quando há 0 OU >1 resultados
if (!contato) { ...insert... }
```
Com `.single()`, **se já existem 2+ contatos** com aquele telefone, a chamada retorna erro e `contato` fica `null` → o webhook insere mais um. Cada mensagem recebida de um número já duplicado cria outra duplicata. Loop infinito.

Pior: como não há **race protection**, mesmo na primeira vez 2 mensagens quase simultâneas (Z-API entrega histórico em rajada) podem fazer 2 INSERTs em paralelo. Foi o que iniciou o problema (veja os timestamps colados: `15:19:39.761` e `15:19:39.828` — 67ms de diferença).

### Bug 2 — Sem constraint de unicidade no banco

A tabela `contatos` não tem `UNIQUE(tenant_id, telefone)`. Sem isso, qualquer race condition resulta em duplicata permanente.

### Bug 3 — Mesmo padrão repetido em outros lugares

`SincronizarWhatsappDialog.tsx`, `pinoquio-sync`, `importar-conversas`, `importar-conversas-html` — todos fazem find-then-insert sem proteção. Já que vamos resolver, vamos resolver para todos.

## Solução (4 partes)

### Parte 1 — Limpar duplicatas existentes (script SQL)

Para cada `(tenant_id, telefone)` duplicado, **manter o contato mais antigo** e:
1. Repointar `conversas.contato_id`, `compras.contato_id`, `giftback_movimentos.contato_id`, `campanha_destinatarios.contato_id` para o "canônico"
2. Somar `saldo_giftback` no canônico
3. Mesclar `tags` (union) e `campos_personalizados` (preferindo o canônico)
4. Deletar os duplicados
5. Deduplicar conversas resultantes (se 2 contatos duplicados tinham conversas separadas, agora ambas apontam para o mesmo contato — fundir mantendo a com `ultima_msg_at` mais recente, repointar mensagens)

### Parte 2 — Adicionar UNIQUE constraint (migration)

```sql
-- Após limpeza
ALTER TABLE contatos
  ADD CONSTRAINT contatos_tenant_telefone_unique
  UNIQUE (tenant_id, telefone);
```
Isso garante que **mesmo com bug futuro, o banco rejeita duplicata**. Também cria índice que acelera lookups.

### Parte 3 — Corrigir `findOrCreateContact` no webhook

Trocar para padrão atômico via `upsert`:
```ts
const { data: contato } = await supabase
  .from("contatos")
  .upsert(
    { tenant_id: tenantId, telefone: phone, nome: name },
    { onConflict: "tenant_id,telefone", ignoreDuplicates: false }
  )
  .select("id")
  .single();
```
`upsert` com a nova UNIQUE constraint é atômico — duas chamadas paralelas = 1 insert + 1 update, nunca 2 inserts.

Detalhe: para não sobrescrever `nome` toda hora, vou usar lookup `.maybeSingle()` primeiro e só fazer upsert se não existir; se a constraint pegar (race), faço re-select.

### Parte 4 — Mesmo fix nos outros 4 lugares

- `SincronizarWhatsappDialog.tsx` — trocar `.single()` por `.maybeSingle()` (já usa) + tratar erro de unique
- `pinoquio-sync/index.ts` — idem
- `importar-conversas/index.ts` e `importar-conversas-html/index.ts` — idem

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| Migration #1 (SQL grande) | Mescla duplicatas: repointa FKs, soma saldos, dedup conversas, deleta órfãos |
| Migration #2 | `ALTER TABLE contatos ADD UNIQUE(tenant_id, telefone)` |
| `supabase/functions/zapi-webhook/index.ts` | `findOrCreateContact` atômico com `.maybeSingle()` + retry/upsert |
| `supabase/functions/pinoquio-sync/index.ts` | Mesmo padrão |
| `supabase/functions/importar-conversas/index.ts` | Mesmo padrão |
| `supabase/functions/importar-conversas-html/index.ts` | Mesmo padrão |
| `src/components/conversas/SincronizarWhatsappDialog.tsx` | Tratar erro de UNIQUE como "buscar de novo" |

## Resultado

- Banco: 451 → ~188 contatos (sem duplicatas, dados consolidados — saldos somados, conversas mescladas, mensagens preservadas)
- Constraint UNIQUE bloqueia futuras duplicatas no nível do banco
- Webhook e demais entradas usam padrão atômico
- Conversas continuam corretas (já estavam)

⚠️ Antes de executar, vou listar quantas linhas serão mescladas em cada tabela e confirmar com você antes do `DELETE` final, já que isso é destrutivo.

