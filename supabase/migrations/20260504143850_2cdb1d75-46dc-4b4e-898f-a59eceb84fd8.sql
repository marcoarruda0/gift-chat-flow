ALTER TABLE public.vendas_online_config
  ADD COLUMN IF NOT EXISTS blinkchat_token text;

UPDATE public.vendas_online_config
SET blinkchat_token = 'bc_' || encode(gen_random_bytes(12), 'hex')
WHERE blinkchat_token IS NULL;

ALTER TABLE public.vendas_online_config
  ALTER COLUMN blinkchat_token SET NOT NULL;

ALTER TABLE public.vendas_online_config
  ALTER COLUMN blinkchat_token SET DEFAULT ('bc_' || encode(gen_random_bytes(12), 'hex'));

CREATE UNIQUE INDEX IF NOT EXISTS vendas_online_config_blinkchat_token_key
  ON public.vendas_online_config (blinkchat_token);