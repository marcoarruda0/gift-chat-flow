

# Adicionar Coluna "Data/Horário" nos Destinatários da Campanha

## Problema
O dialog de detalhes dos destinatários mostra apenas Contato, Telefone e Status. Falta a informação de quando a mensagem foi enviada.

## Solução
A coluna `enviado_at` já existe na tabela `campanha_destinatarios` e já é retornada pela query (usa `SELECT *`). Basta adicionar a coluna na tabela visual.

## Alteração em `src/pages/Disparos.tsx`

1. Adicionar header `Data/Hora` na `TableHeader`
2. Adicionar `TableCell` que formata `d.enviado_at` com `toLocaleString("pt-BR")`, mostrando "—" quando `null` (pendente/falha)
3. Ajustar `colSpan` da linha vazia de 3 para 4
4. Expandir `max-w-lg` para `max-w-2xl` no DialogContent para acomodar a coluna extra

