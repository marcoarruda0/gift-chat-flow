-- 1) Estender ia_config
ALTER TABLE public.ia_config
  ADD COLUMN IF NOT EXISTS copiloto_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS copiloto_canais text[] NOT NULL DEFAULT ARRAY['whatsapp_zapi','whatsapp_cloud']::text[],
  ADD COLUMN IF NOT EXISTS ultima_analise_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_analise_resumo text;

-- 2) Tabela de rascunhos
CREATE TABLE IF NOT EXISTS public.ia_rascunhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversa_id uuid NOT NULL,
  atendente_id uuid NOT NULL,
  conteudo_sugerido text NOT NULL,
  conteudo_enviado text,
  status text NOT NULL DEFAULT 'pendente',
  baseado_em_mensagem_id uuid,
  fontes jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_rascunhos_conversa ON public.ia_rascunhos(conversa_id, status);
CREATE INDEX IF NOT EXISTS idx_ia_rascunhos_tenant_created ON public.ia_rascunhos(tenant_id, created_at DESC);

ALTER TABLE public.ia_rascunhos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_ia_rascunhos" ON public.ia_rascunhos
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_insert_ia_rascunhos" ON public.ia_rascunhos
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_update_ia_rascunhos" ON public.ia_rascunhos
  FOR UPDATE USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_delete_ia_rascunhos" ON public.ia_rascunhos
  FOR DELETE USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE TRIGGER update_ia_rascunhos_updated_at
  BEFORE UPDATE ON public.ia_rascunhos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Tabela de análises de conversas
CREATE TABLE IF NOT EXISTS public.ia_analises_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  iniciado_por uuid,
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  total_conversas int DEFAULT 0,
  total_mensagens int DEFAULT 0,
  resumo_markdown text,
  sugestoes_instrucoes text,
  status text NOT NULL DEFAULT 'rodando',
  erro_mensagem text,
  created_at timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ia_analises_tenant_created ON public.ia_analises_conversas(tenant_id, created_at DESC);

ALTER TABLE public.ia_analises_conversas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_admin_view_ia_analises" ON public.ia_analises_conversas
  FOR SELECT USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE POLICY "tenant_admin_insert_ia_analises" ON public.ia_analises_conversas
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE POLICY "tenant_admin_update_ia_analises" ON public.ia_analises_conversas
  FOR UPDATE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE POLICY "tenant_admin_delete_ia_analises" ON public.ia_analises_conversas
  FOR DELETE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
  );