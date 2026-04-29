## Objetivo

Reforçar o cadastro rápido de cliente no Painel do Caixa com validação de e-mail em tempo real, feedback visual de sucesso, máscaras na exibição do contato e proteção contra duplicidade concorrente (CPF/telefone).

## 1. Validação de e-mail em tempo real (`NovoContatoCaixaDialog.tsx`)

- Validar o e-mail no `onChange` (não só no submit) usando o mesmo schema `zod`.
- Mostrar mensagem "E-mail inválido" abaixo do campo enquanto o usuário digita (após o primeiro blur ou quando há conteúdo).
- Adicionar borda destrutiva (`aria-invalid`) quando inválido.
- O botão **Cadastrar e continuar** fica desabilitado enquanto o e-mail estiver preenchido e inválido (campo permanece opcional quando vazio).
- Pequeno debounce visual (~250 ms) para não piscar erro a cada tecla.

## 2. Feedback de sucesso e destaque do card (`NovoContatoCaixaDialog.tsx` + `GiftbackCaixa.tsx`)

- Trocar o toast genérico "Cliente cadastrado!" por um toast `success` com nome do cliente: "Cliente {nome} cadastrado com sucesso".
- Em `GiftbackCaixa.tsx`, adicionar estado `recemCarregado: boolean` ativado por 2 s sempre que `carregarContato` for chamado.
- Aplicar uma classe de destaque (`ring-2 ring-primary ring-offset-2 transition-shadow`) no `Card` do contato enquanto `recemCarregado` for `true`, com fade-out suave.
- Manter o `scrollIntoView` já existente.

## 3. Máscaras na exibição do card (`GiftbackCaixa.tsx`)

- Importar `mascararCPF` e `mascararTelefoneBR` de `@/lib/br-format`.
- No `CardDescription` do contato, exibir:
  - `CPF: {mascararCPF(contato.cpf)}` quando houver CPF
  - `Tel: {mascararTelefoneBR(contato.telefone)}` quando houver telefone
- A persistência continua somente com dígitos no banco (sem mudanças de schema).
- Boa-prática: como a base pode ter contatos antigos com máscara, as funções já são idempotentes (`apenasDigitos` interno) — exibição fica consistente em ambos os casos.

## 4. Checagem de duplicidade extra no salvar (`NovoContatoCaixaDialog.tsx`)

A pré-checagem atual tem janela de corrida. Reforço:

- Manter o `SELECT` prévio como UX rápida.
- Após o `INSERT`, tratar o erro Postgres `23505` (unique violation) — a tabela já tem `UNIQUE (tenant_id, telefone)`. Quando ocorrer:
  - Buscar o contato existente pelo telefone normalizado.
  - Mostrar toast: "Este telefone já pertence a outro cliente — carregando o cadastro existente."
  - Chamar `onCriado(existente)` e fechar o modal.
- Para CPF: como **não há** unique constraint hoje, fazer um `SELECT ... FOR UPDATE` lógico não é possível pelo client. Vamos:
  - Repetir a verificação por CPF imediatamente antes do `INSERT` (segunda checagem, em transação curta com o insert).
  - Sugerir (parte técnica abaixo) adicionar `UNIQUE (tenant_id, cpf)` via migração para garantia definitiva.

## 5. Migração de banco

Adicionar índice único parcial para CPF por tenant, alinhando à proteção já existente para telefone:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS contatos_tenant_cpf_unique
  ON public.contatos (tenant_id, cpf)
  WHERE cpf IS NOT NULL;
```

Parcial (`WHERE cpf IS NOT NULL`) para não bloquear múltiplos contatos sem CPF informado.

## Detalhes técnicos

- Arquivos alterados: `src/components/giftback/NovoContatoCaixaDialog.tsx`, `src/pages/GiftbackCaixa.tsx`.
- Migração nova em `supabase/migrations/`.
- Sem mudanças em RLS, edge functions ou tipos compartilhados além do que o Supabase regenera.
- Tratamento de erro `23505`: detectar via `error.code === '23505'` retornado pelo PostgREST.

## Fora do escopo

- Normalizar retroativamente CPFs/telefones antigos no banco (pode ser feito em uma tarefa de manutenção separada se desejado).
- Mudanças no fluxo de busca/Caixa que não sejam exibição mascarada e destaque.
