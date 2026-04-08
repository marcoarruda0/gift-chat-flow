
CREATE TABLE public.fluxos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Novo Fluxo',
  descricao text,
  nodes_json jsonb DEFAULT '[]'::jsonb,
  edges_json jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'rascunho',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fluxos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_fluxos" ON public.fluxos
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_insert_fluxos" ON public.fluxos
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_update_fluxos" ON public.fluxos
  FOR UPDATE USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_delete_fluxos" ON public.fluxos
  FOR DELETE USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER update_fluxos_updated_at
  BEFORE UPDATE ON public.fluxos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
