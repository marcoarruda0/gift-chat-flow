
-- Table for Z-API configuration per tenant
CREATE TABLE public.zapi_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instance_id text NOT NULL,
  token text NOT NULL,
  client_token text NOT NULL,
  webhook_url text,
  status text NOT NULL DEFAULT 'desconectado',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

ALTER TABLE public.zapi_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_zapi_config" ON public.zapi_config
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_insert_zapi_config" ON public.zapi_config
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY "tenant_update_zapi_config" ON public.zapi_config
  FOR UPDATE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY "tenant_delete_zapi_config" ON public.zapi_config
  FOR DELETE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE TRIGGER update_zapi_config_updated_at
  BEFORE UPDATE ON public.zapi_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add avatar_url to contatos
ALTER TABLE public.contatos ADD COLUMN avatar_url text;
