ALTER TABLE public.chamado_denis_itens
  ADD COLUMN IF NOT EXISTS abacate_product_id text,
  ADD COLUMN IF NOT EXISTS abacate_product_external_id text;

ALTER TABLE public.vendas_online_config
  ADD COLUMN IF NOT EXISTS api_version integer NOT NULL DEFAULT 2;