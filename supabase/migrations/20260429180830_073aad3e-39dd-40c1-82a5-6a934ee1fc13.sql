-- 1) Tabela instagram_config (uma por tenant)
CREATE TABLE public.instagram_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  ig_user_id text NOT NULL,
  ig_username text,
  page_id text NOT NULL,
  page_access_token text NOT NULL,
  user_access_token text,
  token_expires_at timestamptz,
  verify_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  status text NOT NULL DEFAULT 'desconectado',
  ultimo_erro text,
  ultima_mensagem_at timestamptz,
  ultima_verificacao_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view instagram_config"
ON public.instagram_config FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins insert instagram_config"
ON public.instagram_config FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(),'admin_tenant') OR public.has_role(auth.uid(),'admin_master'))
);

CREATE POLICY "Tenant admins update instagram_config"
ON public.instagram_config FOR UPDATE TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(),'admin_tenant') OR public.has_role(auth.uid(),'admin_master'))
);

CREATE POLICY "Tenant admins delete instagram_config"
ON public.instagram_config FOR DELETE TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (public.has_role(auth.uid(),'admin_tenant') OR public.has_role(auth.uid(),'admin_master'))
);

CREATE TRIGGER trg_instagram_config_updated_at
BEFORE UPDATE ON public.instagram_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_instagram_config_ig_user ON public.instagram_config(ig_user_id);
CREATE INDEX idx_instagram_config_page ON public.instagram_config(page_id);

-- 2) Permitir canal 'instagram' nas conversas
ALTER TABLE public.conversas DROP CONSTRAINT IF EXISTS conversas_canal_check;
ALTER TABLE public.conversas ADD CONSTRAINT conversas_canal_check
  CHECK (canal = ANY (ARRAY['zapi'::text, 'whatsapp_cloud'::text, 'instagram'::text]));

ALTER TABLE public.conversas ADD COLUMN IF NOT EXISTS instagram_thread_id text;

-- 3) Identificadores Instagram em contatos
ALTER TABLE public.contatos ADD COLUMN IF NOT EXISTS instagram_id text;
ALTER TABLE public.contatos ADD COLUMN IF NOT EXISTS instagram_username text;

CREATE INDEX IF NOT EXISTS idx_contatos_instagram_id
  ON public.contatos(tenant_id, instagram_id) WHERE instagram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contatos_instagram_username
  ON public.contatos(tenant_id, instagram_username) WHERE instagram_username IS NOT NULL;