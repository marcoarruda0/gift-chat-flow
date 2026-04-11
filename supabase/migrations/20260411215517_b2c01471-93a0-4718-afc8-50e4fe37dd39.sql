
-- Table for custom field definitions per tenant
CREATE TABLE public.contato_campos_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'texto',
  opcoes TEXT[] DEFAULT '{}',
  obrigatorio BOOLEAN NOT NULL DEFAULT false,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contato_campos_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_campos_config" ON public.contato_campos_config
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_insert_campos_config" ON public.contato_campos_config
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY "tenant_admin_update_campos_config" ON public.contato_campos_config
  FOR UPDATE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY "tenant_admin_delete_campos_config" ON public.contato_campos_config
  FOR DELETE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

-- Add JSONB column to contatos for storing custom field values
ALTER TABLE public.contatos ADD COLUMN campos_personalizados JSONB NOT NULL DEFAULT '{}';
