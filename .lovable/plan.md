

# Plano: Segmentação RFV por Soma (R+F+V)

## Mudança de critério

Em vez de avaliar R, F e V individualmente, classificar pela **soma** dos três (mín 3, máx 15).

### Nova tabela de segmentos (por soma)

| Segmento | Soma R+F+V | Cor |
|---|---|---|
| Campeões | > 12 (13–15) | verde |
| Leais | 10–12 | azul |
| Potenciais | 8–9 | ciano |
| Atenção | 6–7 | amarelo |
| Em Risco | 4–5 | laranja |
| Perdidos | 3 | vermelho |
| Sem dados | algum valor null | cinza |

## Coluna soma no banco

Adicionar coluna **gerada (computed)** em `contatos`:
```sql
ALTER TABLE contatos
  ADD COLUMN rfv_soma smallint
  GENERATED ALWAYS AS (
    COALESCE(rfv_recencia,0) + COALESCE(rfv_frequencia,0) + COALESCE(rfv_valor,0)
  ) STORED;
CREATE INDEX idx_contatos_rfv_soma ON contatos(tenant_id, rfv_soma DESC);
```

Vantagem: sempre sincronizada automaticamente, permite ordenar/filtrar por soma direto no SQL sem alterar a edge function `calcular-rfv`.

## Mudanças nos arquivos

| Arquivo | Mudança |
|---|---|
| Migration | Adiciona coluna gerada `rfv_soma` + índice |
| `src/lib/rfv-segments.ts` | **Novo** — `getSegmento(r,f,v)` baseado em soma; lista de segmentos com cores |
| `src/components/giftback/RfvBadge.tsx` | Usa `getSegmento`; mostra `"5-4-3 · Campeão"`; cor vem do segmento |
| `src/components/giftback/RfvTab.tsx` | Adicionar query separada agregando contagem por segmento; gráfico de pizza (Recharts); filtro por segmento; coluna "Segmento" na tabela; botão "Exportar CSV" respeitando filtros |
| `src/integrations/supabase/types.ts` | Auto-regenerado com `rfv_soma` |

## Detalhes UI (RfvTab)

- **Card "Distribuição por Segmento"** acima da tabela: pizza à esquerda + lista com contagem/percentual à direita
- **Filtro Segmento** ao lado de R/F/V (client-side após query)
- **Coluna "Segmento"** na tabela ranqueada com badge colorido
- **Botão "Exportar CSV"** no header do card de clientes — gera CSV (Nome, Telefone, R, F, V, Soma, Segmento, Saldo GB) sem o limit de 200, respeita filtros ativos, download via Blob

## Resultado

Classificação simplificada e mais intuitiva (uma soma única em vez de 3 critérios combinados). Coluna `rfv_soma` permite queries/ordenação eficientes. Aba RFV ganha gráfico de distribuição, filtro por segmento e exportação CSV.

