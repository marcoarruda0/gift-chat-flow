

# Plano: Módulo RFV (Recência, Frequência, Valor) na página Giftback

## Conceito

Adicionar uma nova aba **"RFV"** dentro da página Giftback que classifica clientes em 3 dimensões com nota 1-5, baseado nas compras dos últimos 12 meses (tabela `compras`). Critérios fixos como no print.

## Critérios fixos (do print)

**Recência** (data da última compra):
- 5: últimos 15 dias | 4: 15-30 dias | 3: 1-3 meses | 2: 3-6 meses | 1: > 6 meses

**Frequência** (nº de compras nos últimos 12 meses):
- 5: > 4 | 4: 4 | 3: 3 | 2: 2 | 1: 1

**Valor** (ticket médio nos últimos 12 meses):
- 5: > R$400 | 4: R$300-400 | 3: R$200-300 | 2: R$100-200 | 1: até R$100

## Mudanças

### 1. Banco de dados (migration)

Adicionar 4 colunas em `contatos`:
- `rfv_recencia` smallint (1-5)
- `rfv_frequencia` smallint (1-5)
- `rfv_valor` smallint (1-5)
- `rfv_calculado_em` timestamptz

Habilitar `pg_cron` + `pg_net` para o job diário.

### 2. Edge function `calcular-rfv`

- Para cada tenant, busca contatos que tiveram compras nos últimos 12 meses
- Calcula R, F, V conforme tabela fixa
- Para contatos sem compra no período: R=1, F=0 (deixa null), V=null
- Faz `UPDATE` em massa nos contatos
- Retorna `{ tenant_id, contatos_atualizados }`

### 3. Cron job (1x ao dia, 03:00 BRT)

Via `pg_cron` chamando a edge function. SQL rodado pelo tool de insert (não migration, pois contém URL/chave).

### 4. Nova aba "RFV" em `GiftbackConfig.tsx`

- Adicionar `<TabsTrigger value="rfv">RFV</TabsTrigger>`
- 3 cards lado-a-lado mostrando a tabela fixa de critérios (Recência, Frequência, Valor) — exatamente como o print
- Botão "Atualizar agora" que invoca a edge function manualmente
- Texto: "Última atualização: {rfv_calculado_em mais recente}"
- Tabela: Top contatos com nome, R, F, V, nota composta (ex: "5-4-3"), saldo giftback. Filtros por R/F/V.

### 5. Badge no contato (`Contatos.tsx`)

- Coluna "RFV" mostrando badge "5-4-3" colorido (verde alto, amarelo médio, vermelho baixo)

### 6. Filtro em Disparos (`Disparos.tsx`)

- Adicionar opção `rfv` ao `tipo_filtro` da campanha
- UI: selector de notas R/F/V (ex: enviar apenas para R≥4 E F≥3)
- Migration: estender enum `campanha_filtro` com `'rfv'`
- Backend de envio (`enviar-campanha`): respeitar o novo filtro

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| Migration SQL | 4 colunas RFV em `contatos`; estender enum `campanha_filtro` |
| `supabase/functions/calcular-rfv/index.ts` | **Novo** — calcula RFV e atualiza contatos |
| `supabase/config.toml` | Registrar nova função |
| Insert SQL (cron) | `pg_cron` schedule diário 03:00 |
| `src/pages/GiftbackConfig.tsx` | Nova aba "RFV" com critérios + tabela + botão atualizar |
| `src/pages/Contatos.tsx` | Coluna/badge RFV |
| `src/pages/Disparos.tsx` | Filtro de campanha por RFV |
| `supabase/functions/enviar-campanha/index.ts` | Suportar filtro `rfv` |

## Resultado

Admin abre Giftback → aba RFV → vê os critérios fixos (igual ao print) + tabela de clientes ranqueados. Job diário recalcula automaticamente. Notas aparecem nos contatos e podem segmentar disparos.

