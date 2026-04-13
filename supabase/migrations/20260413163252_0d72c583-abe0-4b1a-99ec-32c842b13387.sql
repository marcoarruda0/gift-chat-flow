
CREATE TABLE public.fluxo_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  fluxo_id uuid REFERENCES public.fluxos(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo)
);

ALTER TABLE public.fluxo_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_fluxo_config" ON public.fluxo_config
FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_insert_fluxo_config" ON public.fluxo_config
FOR INSERT WITH CHECK (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
);

CREATE POLICY "tenant_admin_update_fluxo_config" ON public.fluxo_config
FOR UPDATE USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
);

CREATE POLICY "tenant_admin_delete_fluxo_config" ON public.fluxo_config
FOR DELETE USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
);

CREATE TRIGGER update_fluxo_config_updated_at
BEFORE UPDATE ON public.fluxo_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
