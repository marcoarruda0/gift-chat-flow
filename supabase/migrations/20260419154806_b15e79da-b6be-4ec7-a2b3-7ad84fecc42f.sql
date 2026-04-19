ALTER TABLE public.contatos
  ADD COLUMN rfv_soma smallint
  GENERATED ALWAYS AS (
    COALESCE(rfv_recencia, 0) + COALESCE(rfv_frequencia, 0) + COALESCE(rfv_valor, 0)
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_contatos_rfv_soma
  ON public.contatos(tenant_id, rfv_soma DESC);