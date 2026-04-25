
# 🎯 Giftback único ativo por cliente

## Regras confirmadas

| # | Regra |
|---|---|
| 1 | Cliente tem **no máximo 1 giftback ativo** simultaneamente |
| 2 | **Resgate é tudo-ou-nada** — usa o valor integral do giftback ativo ou não usa nada |
| 3 | Giftback vira `inativo` quando: (a) **passa da validade** (verificação on-the-fly + job opcional) ou (b) **nova compra é registrada sem usar** o giftback ativo |
| 4 | `contatos.saldo_giftback` = valor do único giftback ativo (0 se nenhum) |
| 5 | Compra mínima para gerar novo continua = `saldo × multiplicador` |

## Implicações importantes (para validar comigo se discordar)

- Quando uma compra **gera novo crédito** e o cliente já tinha um ativo (não usado), o antigo é marcado `inativo` (motivo: `substituido`) e o novo passa a ser o único ativo.
- Quando uma compra é registrada **sem aplicar giftback** e o cliente tinha um ativo, esse ativo é invalidado (motivo: `nao_utilizado`), independentemente da nova compra ter gerado ou não outro crédito.
- Quando o cliente **usa** o giftback (tudo-ou-nada): o ativo vira `usado` e, se a compra atinge o mínimo, gera o novo. Se não atinge, fica sem ativo até a próxima compra qualificada.
- Validades vencidas são detectadas no momento da busca do contato (lazy expire) e marcadas como `expirado`. Saldo é zerado.

---

## 🗄️ Migration

### `giftback_movimentos`
- ADD coluna `motivo_inativacao text NULL` — valores possíveis: `expirado`, `substituido`, `nao_utilizado`, `usado` (auditoria).
- Garantir ENUM `giftback_status` cobre: `ativo`, `usado`, `expirado`, `inativo`. Verificar tipo atual; adicionar valores faltantes via `ALTER TYPE ... ADD VALUE IF NOT EXISTS`.
- **Índice parcial único** para reforçar "1 ativo por contato":
  ```
  CREATE UNIQUE INDEX uniq_giftback_ativo_por_contato
    ON giftback_movimentos (tenant_id, contato_id)
    WHERE tipo = 'credito' AND status = 'ativo';
  ```

### Backfill (opcional, mesma migration)
- Para contatos com >1 movimento ativo hoje: manter o mais recente como `ativo`, marcar os demais como `inativo` (motivo `substituido`) e recalcular `saldo_giftback`.

---

## 🧠 Helper — `src/lib/giftback-rules.ts`

Acrescentar funções puras (testáveis):

```ts
export type ResultadoTransacao = {
  gbUsado: number;         // 0 ou valor integral do ativo
  gbGerado: number;
  acaoSobreAtivo: "manter" | "usar" | "substituir" | "invalidar_nao_uso" | "nenhum";
  novoSaldo: number;
};

export function calcularTransacaoGiftback(input: {
  saldoAtivo: number;            // valor do único giftback ativo (0 se nenhum)
  valorCompra: number;
  aplicarGiftback: boolean;      // toggle do caixa
  multiplicador: number;
  percentual: number;
}): ResultadoTransacao
```

Lógica:
- Se `aplicarGiftback && saldoAtivo > 0 && saldoAtivo <= valorCompra` → `gbUsado = saldoAtivo`, ativo vira `usado`.
- Se `aplicarGiftback && saldoAtivo > valorCompra` → **bloqueio** (resgate tudo-ou-nada exige compra ≥ valor do giftback). Retornar erro de validação.
- Se `!aplicarGiftback && saldoAtivo > 0` → ativo vira `inativo` (`nao_utilizado`).
- Compra mínima para gerar = `saldoAtivo × multiplicador` (avaliado **antes** de qualquer alteração de saldo).
- Se `valorCompra >= compraMinima` → `gbGerado = valorCompra × percentual / 100`. Se já existia ativo e ele não foi usado → ação `substituir` (antigo vira `inativo`).
- `novoSaldo` = `gbGerado` (sempre o valor do novo único ativo, ou 0).

Manter `calcularCompraMinima` como está.

---

## 🖥️ UI — `src/pages/GiftbackCaixa.tsx`

### Busca do contato (lazy expire)
1. Buscar contato + `giftback_movimentos` ativo (`tipo='credito' AND status='ativo' LIMIT 1`).
2. Se existir e `validade < hoje` → UPDATE para `status='expirado'`, `motivo_inativacao='expirado'`, zerar `saldo_giftback`. Recarregar.
3. Resultado: `contato.giftback_ativo` (objeto) + `saldoAtivo` derivado.

### Card do contato
- Mostrar bloco do giftback ativo: valor, validade, dias restantes.
- Se houver ativo: badge "1 giftback ativo válido até DD/MM".
- Texto da regra: "Para gerar novo, compra ≥ R$ X (saldoAtivo × multiplicador)".

### Switch "Aplicar giftback"
- **Visível só se há ativo.**
- Label: "Aplicar **R$ X** (uso integral, não pode ser parcial)".
- Remover input de "valor a utilizar" (não é mais parcial).
- Validação: se `aplicarGiftback && valorCompra < saldoAtivo` → mensagem "A compra precisa ser ≥ R$ X para resgatar este giftback integralmente." e desabilitar Confirmar.

### Aviso amarelo (atualizar texto)
Quando `!aplicarGiftback && saldoAtivo > 0`:
> ⚠️ **O giftback ativo de R$ X será invalidado** ao confirmar esta compra (regra: 1 ativo por cliente, perde se não usado em nova compra).

Quando `valorCompra < compraMinima` (sem mudança da regra atual): manter aviso já existente.

### Confirmação dupla (opcional, mas recomendada)
Antes de submit, se a ação resultará em `invalidar_nao_uso` ou `substituir` com saldo > 0, abrir AlertDialog:
> "Esta operação irá invalidar o giftback atual de R$ X. Deseja continuar?"

### `registrarMutation` — nova ordem
1. Calcular `ResultadoTransacao` (helper).
2. Validar (resgate parcial, regras inválidas).
3. Inserir `compras` com `gbUsado` e `gbGerado`.
4. Se ação `usar` → UPDATE ativo: `status='usado'`, `motivo_inativacao='usado'`.
5. Se ação `substituir` ou `invalidar_nao_uso` → UPDATE ativo: `status='inativo'`, `motivo_inativacao='substituido'|'nao_utilizado'`.
6. Se `gbGerado > 0` → INSERT novo movimento `credito ativo` (com auditoria de segmento/regra).
7. UPDATE `contatos.saldo_giftback = novoSaldo` (sempre = `gbGerado` ou 0).
8. Tudo em sequência; tratar erros com toast (sem RPC nesta fase — operações simples; transação atômica fica como melhoria futura).

### Resumo final
Adicionar linha:
- "Giftback anterior: R$ X — **invalidado** (não utilizado)" / "**substituído**" / "**utilizado integralmente**" / "—".

---

## 🧪 Testes — `src/lib/__tests__/giftback-rules.test.ts`

Adicionar suíte `calcularTransacaoGiftback`:
- Sem ativo + compra ≥ mín → gera novo, ação `nenhum`.
- Sem ativo + compra < mín → nada, saldo 0.
- Com ativo + aplicar=false + compra ≥ mín → invalida antigo + gera novo (`substituir`).
- Com ativo + aplicar=false + compra < mín → invalida antigo, sem gerar (`invalidar_nao_uso`, saldo 0).
- Com ativo + aplicar=true + compra ≥ ativo + compra ≥ mín → usa antigo + gera novo.
- Com ativo + aplicar=true + compra ≥ ativo + compra < mín → usa antigo, não gera (saldo 0).
- Com ativo + aplicar=true + compra < ativo → erro de validação (resgate parcial proibido).
- Saldo = 0 sempre permite gerar (multiplicador × 0 = 0).

---

## 📁 Arquivos afetados

| Tipo | Arquivo |
|---|---|
| Migration | `supabase/migrations/<ts>_giftback_unico_ativo.sql` (coluna + ENUM + índice + backfill) |
| Editado | `src/lib/giftback-rules.ts` (nova função + tipos) |
| Editado | `src/lib/__tests__/giftback-rules.test.ts` (8 cenários novos) |
| Editado | `src/pages/GiftbackCaixa.tsx` (lazy-expire, switch tudo-ou-nada, avisos, mutation, resumo) |
| Auto | `src/integrations/supabase/types.ts` |

## ⚠️ Impacto / Riscos
- **Quebra silenciosa**: clientes que hoje têm múltiplos ativos serão consolidados no backfill. Saldo pode mudar para alguns. Logar quantos foram afetados.
- **Resgate tudo-ou-nada** muda o comportamento atual (parcial). Operadores precisam ser comunicados — sugiro adicionar nota na tela.
- **Job de expiração**: nesta fase fica como lazy-expire na busca. Edge function cron fica para sprint futuro (clientes que nunca voltam mantêm `ativo` no banco, mas o campo `saldo_giftback` só é corrigido quando o contato é acessado). Aceitável?

## 🚫 Fora deste sprint
- Edge function/cron de expiração em massa.
- Notificação automática "seu giftback vai expirar em X dias".
- Histórico visual de inativações no perfil do contato (dados já gravados, faltaria UI).
