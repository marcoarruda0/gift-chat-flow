
-- 1) Extender tabela de itens
ALTER TABLE public.chamado_denis_itens
  ADD COLUMN IF NOT EXISTS abacate_billing_id text,
  ADD COLUMN IF NOT EXISTS abacate_url text,
  ADD COLUMN IF NOT EXISTS abacate_status text,
  ADD COLUMN IF NOT EXISTS pagador_nome text,
  ADD COLUMN IF NOT EXISTS pagador_email text,
  ADD COLUMN IF NOT EXISTS pagador_cel text,
  ADD COLUMN IF NOT EXISTS pagador_tax_id text,
  ADD COLUMN IF NOT EXISTS pago_em timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS chamado_denis_itens_abacate_billing_id_key
  ON public.chamado_denis_itens (abacate_billing_id)
  WHERE abacate_billing_id IS NOT NULL;

-- 2) Configuração por tenant
CREATE TABLE IF NOT EXISTS public.vendas_online_config (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  abacate_api_key text,
  dev_mode boolean NOT NULL DEFAULT true,
  webhook_secret text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendas_online_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendas_config_select" ON public.vendas_online_config;
CREATE POLICY "vendas_config_select" ON public.vendas_online_config
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin_tenant') OR public.has_role(auth.uid(),'admin_master'))
  );

DROP POLICY IF EXISTS "vendas_config_insert" ON public.vendas_online_config;
CREATE POLICY "vendas_config_insert" ON public.vendas_online_config
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin_tenant') OR public.has_role(auth.uid(),'admin_master'))
  );

DROP POLICY IF EXISTS "vendas_config_update" ON public.vendas_online_config;
CREATE POLICY "vendas_config_update" ON public.vendas_online_config
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin_tenant') OR public.has_role(auth.uid(),'admin_master'))
  );

CREATE TRIGGER trg_vendas_online_config_updated
  BEFORE UPDATE ON public.vendas_online_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Log do webhook
CREATE TABLE IF NOT EXISTS public.vendas_online_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  event text,
  billing_id text,
  payload jsonb,
  processado boolean NOT NULL DEFAULT false,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendas_online_webhook_log_billing_idx
  ON public.vendas_online_webhook_log (billing_id, event);

ALTER TABLE public.vendas_online_webhook_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendas_webhook_log_select" ON public.vendas_online_webhook_log;
CREATE POLICY "vendas_webhook_log_select" ON public.vendas_online_webhook_log
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 4) Realtime para a tabela de itens (caso ainda não esteja)
ALTER TABLE public.chamado_denis_itens REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chamado_denis_itens'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.chamado_denis_itens';
  END IF;
END $$;
