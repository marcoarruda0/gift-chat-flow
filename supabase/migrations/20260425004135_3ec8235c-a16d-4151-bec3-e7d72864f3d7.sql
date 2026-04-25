CREATE TABLE public.whatsapp_webhook_eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid,
  phone_number_id text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'recebido',
  erro_mensagem text,
  mensagens_criadas integer NOT NULL DEFAULT 0,
  conversas_criadas integer NOT NULL DEFAULT 0,
  recebido_at timestamptz NOT NULL DEFAULT now(),
  processado_at timestamptz,
  reprocessado_em timestamptz
);

CREATE INDEX idx_wwe_tenant_recebido ON public.whatsapp_webhook_eventos (tenant_id, recebido_at DESC);
CREATE INDEX idx_wwe_phone ON public.whatsapp_webhook_eventos (phone_number_id);

ALTER TABLE public.whatsapp_webhook_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_webhook_eventos"
ON public.whatsapp_webhook_eventos
FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_update_webhook_eventos"
ON public.whatsapp_webhook_eventos
FOR UPDATE
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
);