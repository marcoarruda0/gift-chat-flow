CREATE TABLE public.whatsapp_cloud_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL,
  waba_id text NOT NULL,
  access_token text NOT NULL,
  verify_token text NOT NULL,
  display_phone text,
  status text NOT NULL DEFAULT 'desconectado',
  ultimo_teste_at timestamptz,
  ultimo_erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_cloud_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their tenant whatsapp cloud config"
ON public.whatsapp_cloud_config
FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can insert whatsapp cloud config"
ON public.whatsapp_cloud_config
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))
);

CREATE POLICY "Tenant admins can update whatsapp cloud config"
ON public.whatsapp_cloud_config
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))
);

CREATE POLICY "Tenant admins can delete whatsapp cloud config"
ON public.whatsapp_cloud_config
FOR DELETE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))
);

CREATE TRIGGER update_whatsapp_cloud_config_updated_at
BEFORE UPDATE ON public.whatsapp_cloud_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();