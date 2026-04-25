
-- 1) Campanhas: adicionar colunas para template Cloud
ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS template_language text,
  ADD COLUMN IF NOT EXISTS template_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS template_variaveis jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Campanha destinatarios: tracking nativo Cloud
ALTER TABLE public.campanha_destinatarios
  ADD COLUMN IF NOT EXISTS wa_message_id text,
  ADD COLUMN IF NOT EXISTS status_entrega text,
  ADD COLUMN IF NOT EXISTS status_entrega_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_error jsonb;

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_campanha_dest_status_entrega
  ON public.campanha_destinatarios(campanha_id, status_entrega);

CREATE INDEX IF NOT EXISTS idx_campanha_dest_wa_message_id
  ON public.campanha_destinatarios(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- 4) Habilitar realtime para acompanhar status ao vivo no detalhe da campanha
ALTER TABLE public.campanha_destinatarios REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.campanha_destinatarios;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
