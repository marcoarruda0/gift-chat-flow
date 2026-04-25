ALTER TYPE public.giftback_status ADD VALUE IF NOT EXISTS 'inativo';

ALTER TABLE public.giftback_movimentos
  ADD COLUMN IF NOT EXISTS motivo_inativacao text NULL;

COMMENT ON COLUMN public.giftback_movimentos.motivo_inativacao IS
  'Motivo da inativação/encerramento do crédito: expirado | substituido | nao_utilizado | usado';