-- 1. Status de entrega em mensagens
ALTER TABLE public.mensagens
  ADD COLUMN IF NOT EXISTS status_entrega text,
  ADD COLUMN IF NOT EXISTS status_entrega_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_mensagens_wa_msg_id
  ON public.mensagens ((metadata->>'wa_message_id'))
  WHERE metadata ? 'wa_message_id';

-- 2. Tabela de templates do WhatsApp Cloud
CREATE TABLE IF NOT EXISTS public.whatsapp_cloud_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  meta_template_id text,
  name text NOT NULL,
  language text NOT NULL,
  category text,
  status text NOT NULL DEFAULT 'PENDING',
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason text,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, language)
);

ALTER TABLE public.whatsapp_cloud_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_view_templates ON public.whatsapp_cloud_templates
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY tenant_admin_insert_templates ON public.whatsapp_cloud_templates
  FOR INSERT WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY tenant_admin_update_templates ON public.whatsapp_cloud_templates
  FOR UPDATE USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY tenant_admin_delete_templates ON public.whatsapp_cloud_templates
  FOR DELETE USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))
  );

CREATE TRIGGER trg_whatsapp_cloud_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_cloud_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_wa_templates_tenant ON public.whatsapp_cloud_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wa_templates_status ON public.whatsapp_cloud_templates(tenant_id, status);