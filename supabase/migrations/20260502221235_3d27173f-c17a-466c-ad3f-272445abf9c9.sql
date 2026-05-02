ALTER TABLE public.chamado_denis_itens
  ADD COLUMN IF NOT EXISTS entregue_para_proprio boolean,
  ADD COLUMN IF NOT EXISTS entregue_para_nome text,
  ADD COLUMN IF NOT EXISTS entregue_para_doc text,
  ADD COLUMN IF NOT EXISTS entregue_assinatura text;