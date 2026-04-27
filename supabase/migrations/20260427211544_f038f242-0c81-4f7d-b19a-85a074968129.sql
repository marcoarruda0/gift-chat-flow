CREATE TABLE public.zapi_webhook_eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid,
  instance_id text,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  error_msg text,
  resultado jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone
);

CREATE INDEX idx_zapi_webhook_eventos_tenant_created
  ON public.zapi_webhook_eventos (tenant_id, created_at DESC);

CREATE INDEX idx_zapi_webhook_eventos_unprocessed
  ON public.zapi_webhook_eventos (tenant_id, processed, created_at DESC)
  WHERE processed = false;

ALTER TABLE public.zapi_webhook_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_admin_view_zapi_eventos"
  ON public.zapi_webhook_eventos
  FOR SELECT
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin_tenant'::app_role)
      OR public.has_role(auth.uid(), 'admin_master'::app_role)
    )
  );

CREATE POLICY "tenant_admin_update_zapi_eventos"
  ON public.zapi_webhook_eventos
  FOR UPDATE
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin_tenant'::app_role)
      OR public.has_role(auth.uid(), 'admin_master'::app_role)
    )
  );