-- Tabela de regras de giftback por segmento RFV
CREATE TABLE public.giftback_config_rfv (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  segmento TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  percentual NUMERIC,
  validade_dias INTEGER,
  compra_minima NUMERIC,
  credito_maximo NUMERIC,
  max_resgate_pct NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT giftback_config_rfv_segmento_check CHECK (
    segmento IN ('campeoes','leais','potenciais','atencao','em_risco','perdidos')
  ),
  CONSTRAINT giftback_config_rfv_unique UNIQUE (tenant_id, segmento)
);

ALTER TABLE public.giftback_config_rfv ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_giftback_config_rfv"
  ON public.giftback_config_rfv FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_insert_giftback_config_rfv"
  ON public.giftback_config_rfv FOR INSERT
  WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE POLICY "tenant_admin_update_giftback_config_rfv"
  ON public.giftback_config_rfv FOR UPDATE
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE POLICY "tenant_admin_delete_giftback_config_rfv"
  ON public.giftback_config_rfv FOR DELETE
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE TRIGGER update_giftback_config_rfv_updated_at
  BEFORE UPDATE ON public.giftback_config_rfv
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auditoria nos movimentos
ALTER TABLE public.giftback_movimentos
  ADD COLUMN segmento_rfv TEXT,
  ADD COLUMN regra_percentual NUMERIC;