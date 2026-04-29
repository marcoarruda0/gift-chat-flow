## Problema

No caixa do Giftback, ao digitar um telefone como `11952697419` (sem DDI), o cadastro existente gravado como `5511952697419` (com DDI 55) não é localizado. A busca atual em `GiftbackCaixa.tsx → buscarContato()` só faz match exato do valor digitado (com e sem máscara) contra `cpf`/`telefone`, então qualquer divergência de formato (DDI 55, 9º dígito) gera "contato não encontrado" — mesmo já existindo na base.

Curiosamente, o `NovoContatoCaixaDialog` (cadastro rápido) já usa `gerarVariantesTelefone()` de `src/lib/br-format.ts`, que cobre exatamente esses casos (com/sem 55, com/sem 9 extra). A busca principal do caixa simplesmente não foi alinhada a essa lógica.

## Solução

Reutilizar utilitários já existentes em `src/lib/br-format.ts` para que a busca do caixa case telefones em qualquer formato gravado, sem mudar o banco e sem migração de dados.

### 1. Detectar se o termo é telefone e gerar variantes

Em `src/pages/GiftbackCaixa.tsx → buscarContato()`:

- Se o termo digitado, após `apenasDigitos`, parecer telefone BR (10 ou 11 dígitos com DDD válido, validado por `validarTelefoneBR`), montar a lista de variantes via `gerarVariantesTelefone(termoDigitos)`.
- Para cada variante, adicionar um filtro `telefone.eq.<variante>` ao `.or(...)` da consulta. Isso cobre:
  - número puro (`11952697419`)
  - com DDI (`5511952697419`)
  - sem o 9 extra (`1152697419` e `551152697419`)
  - com 9 extra (caso o cadastro antigo seja sem 9)
- Manter os filtros atuais para CPF (com e sem máscara) e o filtro literal para o termo, preservando comportamento atual quando o termo for CPF ou texto livre.

### 2. Aplicar máscara visual ao detectar telefone (UX)

No `Input` de busca do caixa (mesmo arquivo, próximo à linha 494):

- Enquanto o usuário digita, se o conteúdo for puramente numérico e tiver entre 10 e 13 dígitos (cobrindo `5511...`), aplicar `mascararTelefoneBR(normalizarTelefoneBR(valor))` para exibição.
- Se for CPF (11 dígitos válidos via `ehProvavelCPF`), manter `mascararCPF`.
- Caso contrário, deixar o texto bruto (busca por nome/parcial não muda).
- A normalização é apenas para exibição/máscara; a busca já passa por `apenasDigitos` + variantes, então digitar com ou sem 55 funciona igual.

### 3. Trato de empate (mais de 1 match)

`maybeSingle()` falha se a busca por variantes retornar 2 linhas (improvável, mas possível em bases sujas). Trocar por `.limit(1)` ordenando por `created_at asc` para sempre carregar o cadastro mais antigo, igual ao padrão usado em `NovoContatoCaixaDialog.buscarMatches`.

### Arquivos afetados

- `src/pages/GiftbackCaixa.tsx` — função `buscarContato` e o `Input` de busca.

Sem mudanças em banco, edge functions, RLS ou outros módulos.

### Fora do escopo

- Não vamos normalizar/migrar telefones já gravados na tabela `contatos` (risco alto e desnecessário para resolver o problema).
- Não mexemos em outros pontos de busca (Contatos, Conversas) — este pedido é específico do Giftback.