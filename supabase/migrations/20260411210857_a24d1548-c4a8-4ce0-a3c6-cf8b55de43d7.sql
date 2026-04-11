ALTER TABLE public.campanhas
ADD COLUMN tipo_midia text NOT NULL DEFAULT 'texto',
ADD COLUMN midia_url text;