-- Enable extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Add RFV columns to contatos
ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS rfv_recencia smallint,
  ADD COLUMN IF NOT EXISTS rfv_frequencia smallint,
  ADD COLUMN IF NOT EXISTS rfv_valor smallint,
  ADD COLUMN IF NOT EXISTS rfv_calculado_em timestamptz;

-- Index to speed up RFV queries/filters per tenant
CREATE INDEX IF NOT EXISTS idx_contatos_tenant_rfv
  ON public.contatos (tenant_id, rfv_recencia, rfv_frequencia, rfv_valor);

-- Extend campanha_filtro enum with 'rfv'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'campanha_filtro' AND e.enumlabel = 'rfv'
  ) THEN
    ALTER TYPE public.campanha_filtro ADD VALUE 'rfv';
  END IF;
END $$;