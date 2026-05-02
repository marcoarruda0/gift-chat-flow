
CREATE TABLE public.vendas_online_locais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendas_online_locais_tenant ON public.vendas_online_locais(tenant_id);

ALTER TABLE public.vendas_online_locais ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_view_vendas_locais ON public.vendas_online_locais
  FOR SELECT USING ((tenant_id = get_user_tenant_id(auth.uid())) OR has_role(auth.uid(), 'admin_master'::app_role));
CREATE POLICY tenant_insert_vendas_locais ON public.vendas_online_locais
  FOR INSERT WITH CHECK ((tenant_id = get_user_tenant_id(auth.uid())) OR has_role(auth.uid(), 'admin_master'::app_role));
CREATE POLICY tenant_update_vendas_locais ON public.vendas_online_locais
  FOR UPDATE USING ((tenant_id = get_user_tenant_id(auth.uid())) OR has_role(auth.uid(), 'admin_master'::app_role));
CREATE POLICY tenant_delete_vendas_locais ON public.vendas_online_locais
  FOR DELETE USING ((tenant_id = get_user_tenant_id(auth.uid())) OR has_role(auth.uid(), 'admin_master'::app_role));

CREATE TRIGGER trg_vendas_online_locais_updated_at
  BEFORE UPDATE ON public.vendas_online_locais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.chamado_denis_itens
  ADD COLUMN IF NOT EXISTS local_id uuid REFERENCES public.vendas_online_locais(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entregue boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entregue_em timestamptz,
  ADD COLUMN IF NOT EXISTS entregue_por uuid,
  ADD COLUMN IF NOT EXISTS forma_pagamento text;
