ALTER TABLE public.conversas
ADD COLUMN atendimento_iniciado_at timestamptz,
ADD COLUMN atendimento_encerrado_at timestamptz;