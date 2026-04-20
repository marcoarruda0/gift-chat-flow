ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS email_reply_to text;