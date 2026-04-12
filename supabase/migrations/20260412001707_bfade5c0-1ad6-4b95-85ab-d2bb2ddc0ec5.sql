
-- Create departamentos table
CREATE TABLE public.departamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "tenant_view_departamentos"
  ON public.departamentos FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_insert_departamentos"
  ON public.departamentos FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master')));

CREATE POLICY "tenant_admin_update_departamentos"
  ON public.departamentos FOR UPDATE
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master')));

CREATE POLICY "tenant_admin_delete_departamentos"
  ON public.departamentos FOR DELETE
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master')));

-- Add departamento_id to profiles
ALTER TABLE public.profiles ADD COLUMN departamento_id uuid REFERENCES public.departamentos(id) ON DELETE SET NULL;

-- Add departamento_id to conversas
ALTER TABLE public.conversas ADD COLUMN departamento_id uuid REFERENCES public.departamentos(id) ON DELETE SET NULL;
