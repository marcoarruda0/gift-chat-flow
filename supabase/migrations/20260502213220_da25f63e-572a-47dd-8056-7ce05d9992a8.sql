CREATE UNIQUE INDEX IF NOT EXISTS vendas_online_config_webhook_secret_uniq
  ON public.vendas_online_config (webhook_secret)
  WHERE webhook_secret IS NOT NULL;