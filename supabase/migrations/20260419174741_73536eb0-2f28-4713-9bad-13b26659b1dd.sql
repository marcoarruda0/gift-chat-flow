ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS email_remetente_nome text,
  ADD COLUMN IF NOT EXISTS email_remetente_local text DEFAULT 'contato',
  ADD COLUMN IF NOT EXISTS email_assinatura text;