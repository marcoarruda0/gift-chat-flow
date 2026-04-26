# Correção: erro ao criar campanha WhatsApp Oficial

## Causa raiz

A tabela `public.campanhas` tem uma CHECK constraint chamada `campanhas_canal_check` que hoje aceita **apenas** dois valores na coluna `canal`:

```sql
CHECK (canal = ANY (ARRAY['whatsapp'::text, 'email'::text]))
```

Porém, ao adicionar o canal **WhatsApp Oficial (Cloud API)**, o front-end (`src/pages/Campanhas.tsx`) e a edge function `enviar-campanha-cloud` passaram a usar o valor `'whatsapp_cloud'`. Quando o usuário tenta criar uma campanha desse canal, o INSERT é rejeitado pelo Postgres com:

> new row for relation "campanhas" violates check constraint "campanhas_canal_check"

## Solução

Migração de schema para recriar a constraint incluindo `'whatsapp_cloud'` na lista de valores permitidos.

```sql
ALTER TABLE public.campanhas DROP CONSTRAINT IF EXISTS campanhas_canal_check;
ALTER TABLE public.campanhas
  ADD CONSTRAINT campanhas_canal_check
  CHECK (canal = ANY (ARRAY['whatsapp'::text, 'whatsapp_cloud'::text, 'email'::text]));
```

## Escopo

- **Migração**: 1 arquivo SQL novo em `supabase/migrations/` aplicando o ALTER TABLE acima.
- **Sem alterações de código** no front-end nem nas edge functions — eles já enviam/esperam `whatsapp_cloud` corretamente.
- **Sem impacto em dados existentes**: registros atuais usam `'whatsapp'` ou `'email'`, ambos continuam válidos.

## Verificação pós-deploy

1. Abrir **Campanhas** → **Nova campanha** → escolher **WhatsApp Oficial**, selecionar template e destinatários, salvar.
2. Confirmar que o registro é criado em `campanhas` com `canal = 'whatsapp_cloud'`.
3. Disparar a campanha e validar que `enviar-campanha-cloud` processa normalmente.
