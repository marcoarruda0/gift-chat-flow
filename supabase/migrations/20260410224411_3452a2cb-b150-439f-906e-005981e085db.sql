
-- Enums for IA config
CREATE TYPE public.ia_tom AS ENUM ('formal', 'amigavel', 'casual');
CREATE TYPE public.ia_emojis AS ENUM ('nao', 'pouco', 'sim');

-- Table
CREATE TABLE public.ia_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome_assistente TEXT NOT NULL DEFAULT 'Assistente Virtual',
  tom ia_tom NOT NULL DEFAULT 'amigavel',
  usar_emojis ia_emojis NOT NULL DEFAULT 'pouco',
  instrucoes_extras TEXT DEFAULT '',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.ia_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_ia_config" ON public.ia_config
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_insert_ia_config" ON public.ia_config
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY "tenant_admin_update_ia_config" ON public.ia_config
  FOR UPDATE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY "tenant_admin_delete_ia_config" ON public.ia_config
  FOR DELETE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

-- Updated_at trigger
CREATE TRIGGER update_ia_config_updated_at
  BEFORE UPDATE ON public.ia_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
