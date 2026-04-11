
CREATE TABLE public.respostas_rapidas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  atalho text NOT NULL,
  conteudo text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.respostas_rapidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_respostas_rapidas" ON public.respostas_rapidas
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_insert_respostas_rapidas" ON public.respostas_rapidas
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY "tenant_admin_update_respostas_rapidas" ON public.respostas_rapidas
  FOR UPDATE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY "tenant_admin_delete_respostas_rapidas" ON public.respostas_rapidas
  FOR DELETE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );
