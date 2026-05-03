CREATE TABLE public.chamado_denis_entregas_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  acao text NOT NULL,
  usuario_id uuid,
  usuario_nome text,
  retirante_proprio boolean,
  retirante_nome text,
  retirante_doc text,
  assinatura text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_entregas_log_item ON public.chamado_denis_entregas_log(item_id, created_at DESC);
CREATE INDEX idx_entregas_log_tenant ON public.chamado_denis_entregas_log(tenant_id);

ALTER TABLE public.chamado_denis_entregas_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_view_entregas_log ON public.chamado_denis_entregas_log
  FOR SELECT USING ((tenant_id = get_user_tenant_id(auth.uid())) OR has_role(auth.uid(),'admin_master'::app_role));

CREATE POLICY tenant_insert_entregas_log ON public.chamado_denis_entregas_log
  FOR INSERT WITH CHECK ((tenant_id = get_user_tenant_id(auth.uid())) OR has_role(auth.uid(),'admin_master'::app_role));
