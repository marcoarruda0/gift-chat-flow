ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'zapi',
  ADD COLUMN IF NOT EXISTS whatsapp_cloud_phone_id text;

ALTER TABLE public.conversas
  DROP CONSTRAINT IF EXISTS conversas_canal_check;

ALTER TABLE public.conversas
  ADD CONSTRAINT conversas_canal_check
  CHECK (canal IN ('zapi', 'whatsapp_cloud'));

CREATE INDEX IF NOT EXISTS idx_conversas_tenant_canal
  ON public.conversas (tenant_id, canal);
