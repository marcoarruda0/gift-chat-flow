ALTER TABLE public.campanhas DROP CONSTRAINT IF EXISTS campanhas_canal_check;
ALTER TABLE public.campanhas
  ADD CONSTRAINT campanhas_canal_check
  CHECK (canal = ANY (ARRAY['whatsapp'::text, 'whatsapp_cloud'::text, 'email'::text]));