
ALTER TABLE public.whatsapp_webhook_eventos
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS hmac_valido boolean;

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_eventos_dedup
  ON public.whatsapp_webhook_eventos (tenant_id, payload_hash)
  WHERE payload_hash IS NOT NULL AND tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_eventos_status_recebido
  ON public.whatsapp_webhook_eventos (tenant_id, status, recebido_at DESC);
