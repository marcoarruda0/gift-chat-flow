
-- Enum for campaign status
CREATE TYPE public.campanha_status AS ENUM ('rascunho', 'agendada', 'enviando', 'concluida', 'cancelada');

-- Enum for campaign filter type
CREATE TYPE public.campanha_filtro AS ENUM ('todos', 'tag', 'manual');

-- Enum for recipient status
CREATE TYPE public.destinatario_status AS ENUM ('pendente', 'enviado', 'falha');

-- Campaigns table
CREATE TABLE public.campanhas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  nome text NOT NULL,
  mensagem text NOT NULL,
  tipo_filtro campanha_filtro NOT NULL DEFAULT 'todos',
  filtro_valor text[] DEFAULT '{}',
  status campanha_status NOT NULL DEFAULT 'rascunho',
  agendada_para timestamptz,
  total_destinatarios integer NOT NULL DEFAULT 0,
  total_enviados integer NOT NULL DEFAULT 0,
  total_falhas integer NOT NULL DEFAULT 0,
  criado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_campanhas" ON public.campanhas FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_admin_insert_campanhas" ON public.campanhas FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master')));
CREATE POLICY "tenant_admin_update_campanhas" ON public.campanhas FOR UPDATE USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master')));
CREATE POLICY "tenant_admin_delete_campanhas" ON public.campanhas FOR DELETE USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master')));

CREATE TRIGGER update_campanhas_updated_at BEFORE UPDATE ON public.campanhas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Campaign recipients table
CREATE TABLE public.campanha_destinatarios (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  contato_id uuid NOT NULL REFERENCES public.contatos(id),
  telefone text NOT NULL,
  status destinatario_status NOT NULL DEFAULT 'pendente',
  enviado_at timestamptz,
  erro text,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id)
);

ALTER TABLE public.campanha_destinatarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_destinatarios" ON public.campanha_destinatarios FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_admin_insert_destinatarios" ON public.campanha_destinatarios FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master')));
CREATE POLICY "tenant_admin_update_destinatarios" ON public.campanha_destinatarios FOR UPDATE USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master')));
CREATE POLICY "tenant_admin_delete_destinatarios" ON public.campanha_destinatarios FOR DELETE USING (tenant_id = get_user_tenant_id(auth.uid()) AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master')));

CREATE INDEX idx_campanha_destinatarios_campanha ON public.campanha_destinatarios(campanha_id);
CREATE INDEX idx_campanha_destinatarios_status ON public.campanha_destinatarios(status);
CREATE INDEX idx_campanhas_tenant ON public.campanhas(tenant_id);
CREATE INDEX idx_campanhas_status ON public.campanhas(status);
