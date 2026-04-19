ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS email_assunto text,
  ADD COLUMN IF NOT EXISTS email_html text,
  ADD COLUMN IF NOT EXISTS email_preview text;

ALTER TABLE public.campanhas
  DROP CONSTRAINT IF EXISTS campanhas_canal_check;

ALTER TABLE public.campanhas
  ADD CONSTRAINT campanhas_canal_check CHECK (canal IN ('whatsapp', 'email'));