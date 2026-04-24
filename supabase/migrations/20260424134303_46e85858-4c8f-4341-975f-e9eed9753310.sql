ALTER TABLE public.whatsapp_cloud_config
  ADD COLUMN IF NOT EXISTS ultima_verificacao_at timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_mensagem_at timestamptz;