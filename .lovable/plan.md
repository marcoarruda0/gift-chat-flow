# 🎯 Substituir compra mínima por multiplicador do giftback

## Objetivo
Trocar o conceito de **compra mínima em R$** por **multiplicador do saldo de giftback** (ex.: `4×` → cliente com R$ 100 de saldo precisa gastar ≥ R$ 400 para gerar novo giftback). Remover completamente `credito_maximo` e `max_resgate_pct` do modelo (banco, helper e UI).

## Regra confirmada
- Compra mínima dinâmica = `saldo_giftback × multiplicador`
- Aplica-se **só para gerar** novo giftback (não bloqueia o registro nem o resgate)
- Saldo = 0 → `0 × N = 0` → qualquer compra gera giftback
- Resgate: limitado a `min(saldo, valor da compra)` — sem % máximo
- Sem teto de crédito por transação
- Default sugerido para `multiplicador_compra_minima`: **4**

---

## 🗄️ Migration

**`giftback_config`**
- ADD `multiplicador_compra_minima integer DEFAULT 4`
- DROP `compra_minima`, `credito_maximo`, `max_resgate_pct`

**`giftback_config_rfv`** (overrides por segmento)
- ADD `multiplicador_compra_minima integer` (nullable → herda global)
- DROP `compra_minima`, `credito_maximo`, `max_resgate_pct`

`giftback_movimentos` e `compras` permanecem inalteradas — `segmento_rfv` e `regra_percentual` continuam preservando histórico.

---

## 🧠 Helper — `src/lib/giftback-rules.ts`
- Atualizar `GiftbackConfigGlobal`, `GiftbackConfigRfvOverride`, `RegrasGiftbackResolvidas` removendo os 3 campos antigos e adicionando `multiplicador_compra_minima`
- `DEFAULTS`: `percentual: 10`, `validade_dias: 30`, `multiplicador_compra_minima: 4`
- `resolverRegrasGiftback` mantém merge override → global → default
- Novo helper exportado: `calcularCompraMinima(saldo, multiplicador) → number`

---

## 🖥️ UI

### `src/pages/GiftbackConfig.tsx` (card global)
- Remover inputs: Compra Mínima, Crédito Máximo, % Máximo de Resgate
- Adicionar input **"Multiplicador da compra mínima"** com helper text:
  > "Cliente precisa gastar ao menos `multiplicador × saldo de giftback` para gerar nova bonificação. Use `0` para desativar."

### `src/components/giftback/RegrasRfvConfig.tsx`
- Reduzir grid de 5 para 3 colunas: **% Retorno · Validade · Multiplicador**
- Atualizar `RegraLocal`, `placeholderGlobal`, `DEFAULT_PH` e `salvarMutation.payload`

### `src/pages/GiftbackCaixa.tsx`
- Card de regras passa a mostrar:
  - "Multiplicador 4× — para gerar giftback, compra ≥ **R$ 400,00** (saldo R$ 100 × 4)"
  - Ou "Qualquer compra gera giftback" quando saldo = 0 ou multiplicador = 0
- `registrarMutation`:
  - **Não** bloquear mais a compra por compra mínima
  - `gbGerado` só é calculado se `valor >= saldo × multiplicador`; senão `0`
  - `gbUsado = min(solicitado, saldo, valor)` — sem teto percentual
- Input de resgate: `max = min(saldo, valor da compra)`, label atualizada
- Resumo final mostra a compra mínima calculada em vez do % máx. resgate

---

## 📁 Arquivos afetados

| Tipo | Arquivo |
|---|---|
| Migration | `supabase/migrations/<timestamp>_giftback_multiplicador.sql` |
| Editado | `src/lib/giftback-rules.ts` |
| Editado | `src/pages/GiftbackConfig.tsx` |
| Editado | `src/components/giftback/RegrasRfvConfig.tsx` |
| Editado | `src/pages/GiftbackCaixa.tsx` |
| Auto | `src/integrations/supabase/types.ts` |

## ⚠️ Impacto
- Configurações dos 3 campos antigos serão **perdidas** (drop de coluna). Multiplicador inicia em **4** para todos os tenants via default.
- Auditoria histórica em `giftback_movimentos` permanece intacta.
- Nenhuma edge function precisa de mudança neste sprint.