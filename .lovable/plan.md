

# Formatar valores monetários no Dashboard Peça Rara

## Problema
Os valores de PIX e Consignação na tabela do Dashboard estão exibidos sem formatação monetária (ex: `R$ 83` em vez de `R$ 83,00` ou `R$ 1.234,56`).

## Solução
Criar uma função helper `formatCurrency` e aplicar nas duas colunas da tabela.

### Arquivo: `src/pages/PecaRara.tsx`

1. **Adicionar helper** (após as funções existentes no topo):
```typescript
function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "R$ 0,00";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
```

2. **Substituir linha 256**:
`R$ {c.vl_total_fornecedor_pix}` → `{formatCurrency(c.vl_total_fornecedor_pix)}`

3. **Substituir linha 257**:
`R$ {c.vl_total_fornecedor_consignacao}` → `{formatCurrency(c.vl_total_fornecedor_consignacao)}`

4. **Template preview** (linhas 41-42) — formatar também os valores de exemplo:
`String(EXAMPLE_DATA.valor_pix)` → `formatCurrency(EXAMPLE_DATA.valor_pix)`
`String(EXAMPLE_DATA.valor_consignacao)` → `formatCurrency(EXAMPLE_DATA.valor_consignacao)`

