
CREATE TABLE public.fluxo_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid REFERENCES public.conversas(id) ON DELETE CASCADE NOT NULL,
  fluxo_id uuid REFERENCES public.fluxos(id) ON DELETE CASCADE NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) NOT NULL,
  node_atual text NOT NULL,
  aguardando_resposta boolean DEFAULT false,
  dados jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(conversa_id)
);

ALTER TABLE public.fluxo_sessoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_fluxo_sessoes" ON public.fluxo_sessoes
  FOR SELECT TO public USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_insert_fluxo_sessoes" ON public.fluxo_sessoes
  FOR INSERT TO public WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_update_fluxo_sessoes" ON public.fluxo_sessoes
  FOR UPDATE TO public USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_delete_fluxo_sessoes" ON public.fluxo_sessoes
  FOR DELETE TO public USING (tenant_id = get_user_tenant_id(auth.uid()));
