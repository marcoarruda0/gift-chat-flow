ALTER TABLE public.giftback_config
  ADD COLUMN IF NOT EXISTS multiplicador_compra_minima integer NOT NULL DEFAULT 4,
  DROP COLUMN IF EXISTS compra_minima,
  DROP COLUMN IF EXISTS credito_maximo,
  DROP COLUMN IF EXISTS max_resgate_pct;

ALTER TABLE public.giftback_config_rfv
  ADD COLUMN IF NOT EXISTS multiplicador_compra_minima integer,
  DROP COLUMN IF EXISTS compra_minima,
  DROP COLUMN IF EXISTS credito_maximo,
  DROP COLUMN IF EXISTS max_resgate_pct;