
CREATE TABLE public.conhecimento_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  titulo text NOT NULL,
  conteudo text NOT NULL,
  categoria text DEFAULT 'geral',
  tags text[] DEFAULT '{}',
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.conhecimento_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_kb" ON public.conhecimento_base FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_insert_kb" ON public.conhecimento_base FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_update_kb" ON public.conhecimento_base FOR UPDATE USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_delete_kb" ON public.conhecimento_base FOR DELETE USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER update_conhecimento_base_updated_at
  BEFORE UPDATE ON public.conhecimento_base
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
