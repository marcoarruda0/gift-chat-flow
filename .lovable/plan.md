## Problema 1 — Não consegue acessar "Produtos vendidos"

A seção existe em `src/pages/ChamadoDenis.tsx` (página Vendas Online), mas como você está no viewport **mobile (375px)** e ela é renderizada como `<Table>` larga após a tabela principal + KPIs, ela:
- fica empurrada para fora do scroll vertical inicial; e
- estoura horizontalmente sem wrapper de scroll, ficando "cortada".

**Correções:**
- Envolver a tabela "Produtos vendidos" em `div.overflow-x-auto` (igual à tabela principal).
- Em telas `<md`, renderizar **cards** (1 por item) em vez da tabela, com os mesmos campos (ID, descrição, valor, forma pgto, cliente+CPF, dropdown de Local, status entregue e botão de entrega). Mantém a tabela em desktop.
- Adicionar âncora `#vendidos` + botão de atalho no topo ("Ir para vendidos") para facilitar acesso.

## Problema 2 — Fluxo de confirmação de entrega

Hoje o ícone `PackageCheck` é um toggle direto. Vamos transformá-lo em um **diálogo de confirmação** que registra **quem retirou** e **assinatura**.

### 2.1 Banco de dados (migration)

Novas colunas em `chamado_denis_itens`:
| Coluna | Tipo | Notas |
|---|---|---|
| `entregue_para_proprio` | boolean nullable | true = retirado pelo próprio comprador |
| `entregue_para_nome` | text nullable | nome de quem retirou (se outra pessoa) |
| `entregue_para_doc` | text nullable | CPF/RG de quem retirou (opcional) |
| `entregue_assinatura` | text nullable | data URL PNG (base64) da assinatura |

Sem mudança em RLS (já cobertas pelas policies existentes da tabela).

### 2.2 UI — novo componente `ConfirmarEntregaDialog`

Arquivo: `src/components/vendas-online/ConfirmarEntregaDialog.tsx`.

Conteúdo do diálogo:
- Cabeçalho: "Confirmar entrega — Item #N — {descricao}"
- Resumo do comprador (Nome + CPF) em destaque.
- **Radio group** "Quem está retirando?":
  - `Próprio comprador ({pagador_nome})` (default)
  - `Outra pessoa`
- Se "Outra pessoa":
  - Input **Nome de quem está retirando** (obrigatório)
  - Input **Documento (CPF/RG)** (opcional)
- **Pad de assinatura** (obrigatório):
  - `<canvas>` ~320x140 com captura de pointer/touch (sem dependência nova).
  - Botões: "Limpar".
  - Validação: precisa ter ≥ N traços antes de confirmar.
- Botões do rodapé: "Cancelar" / "Confirmar entrega" (desabilitado até validar).

Ao confirmar:
```ts
await supabase.from("chamado_denis_itens").update({
  entregue: true,
  entregue_em: new Date().toISOString(),
  entregue_por: profile.id,
  entregue_para_proprio: proprio,
  entregue_para_nome: proprio ? null : nome.trim(),
  entregue_para_doc:   proprio ? null : (doc.trim() || null),
  entregue_assinatura: canvas.toDataURL("image/png"),
}).eq("id", item.id);
```

### 2.3 Mudanças em `ChamadoDenis.tsx`
- Substituir `toggleEntregue` por:
  - Se `!item.entregue` → abre `ConfirmarEntregaDialog`.
  - Se `item.entregue` → abre `AlertDialog` "Desfazer entrega?" (limpa todos os campos de entrega + assinatura).
- Coluna **Entregue?**: ao clicar no badge "Sim", abre um `Popover`/`Dialog` somente leitura mostrando: data, quem registrou, quem retirou (próprio/outro + nome/doc) e thumbnail da assinatura.
- Atualizar `Item` type e `SELECT_COLS` com as 4 novas colunas.

## Arquivos afetados
- `supabase/migrations/<novo>.sql` — 4 colunas em `chamado_denis_itens`
- `src/components/vendas-online/ConfirmarEntregaDialog.tsx` *(novo)*
- `src/pages/ChamadoDenis.tsx` — wrapper scroll + cards mobile + integração do diálogo + visualização da assinatura

## Fora de escopo (próximo prompt, se quiser)
- Geração de comprovante PDF da entrega
- Notificação automática ao comprador quando entrega é confirmada
- Upload da assinatura para Storage (por ora fica como data URL na coluna `text`; aceitável para assinaturas pequenas)
