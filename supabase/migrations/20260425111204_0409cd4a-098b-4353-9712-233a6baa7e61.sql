
ALTER TABLE public.whatsapp_cloud_config
  ADD COLUMN IF NOT EXISTS alerta_taxa_erro_pct integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS alerta_min_eventos integer NOT NULL DEFAULT 10;

CREATE TABLE IF NOT EXISTS public.whatsapp_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  taxa_erro_pct numeric NOT NULL,
  limite_pct integer NOT NULL,
  total_eventos integer NOT NULL,
  total_erros integer NOT NULL,
  detalhe text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_alertas_tenant_created
  ON public.whatsapp_alertas (tenant_id, created_at DESC);

ALTER TABLE public.whatsapp_alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_whatsapp_alertas"
  ON public.whatsapp_alertas
  FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_insert_whatsapp_alertas"
  ON public.whatsapp_alertas
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin_tenant'::app_role)
      OR public.has_role(auth.uid(), 'admin_master'::app_role)
    )
  );

CREATE POLICY "tenant_admin_delete_whatsapp_alertas"
  ON public.whatsapp_alertas
  FOR DELETE
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin_tenant'::app_role)
      OR public.has_role(auth.uid(), 'admin_master'::app_role)
    )
  );
