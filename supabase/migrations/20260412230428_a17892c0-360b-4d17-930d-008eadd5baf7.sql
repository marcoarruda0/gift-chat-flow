-- =====================================================
-- TABELA: pinoquio_config
-- =====================================================
CREATE TABLE public.pinoquio_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  jwt_token text NOT NULL DEFAULT '',
  api_base_url text NOT NULL DEFAULT 'https://api-pinoquio.pecararabrecho.com.br/api',
  intervalo_polling_min integer NOT NULL DEFAULT 10,
  polling_ativo boolean NOT NULL DEFAULT false,
  template_mensagem text NOT NULL DEFAULT 'Aprovação da Captação: R-{id}

Para conferir e aprovar os itens para venda, clique no link:
{link}

Importante: As peças que não forem aprovadas na triagem serão encaminhadas para doação no prazo de até 7 dias úteis após o cadastro das mercadorias. Caso não concorde com a doação, por favor, entre em contato com a loja o quanto antes.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinoquio_config_tenant_unique UNIQUE (tenant_id)
);

ALTER TABLE public.pinoquio_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_pinoquio_config" ON public.pinoquio_config
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_insert_pinoquio_config" ON public.pinoquio_config
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY "tenant_admin_update_pinoquio_config" ON public.pinoquio_config
  FOR UPDATE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY "tenant_admin_delete_pinoquio_config" ON public.pinoquio_config
  FOR DELETE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE TRIGGER update_pinoquio_config_updated_at
  BEFORE UPDATE ON public.pinoquio_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- TABELA: pinoquio_notificacoes
-- =====================================================
CREATE TABLE public.pinoquio_notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cadastramento_id integer NOT NULL,
  cadastramento_id_external text,
  fornecedor_nome text,
  fornecedor_telefone text,
  lote text,
  link_aprovacao text,
  mensagem_enviada text,
  status text NOT NULL DEFAULT 'pendente',
  erro_mensagem text,
  enviado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinoquio_notif_unique UNIQUE (tenant_id, cadastramento_id)
);

ALTER TABLE public.pinoquio_notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_pinoquio_notificacoes" ON public.pinoquio_notificacoes
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_insert_pinoquio_notificacoes" ON public.pinoquio_notificacoes
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY "tenant_admin_update_pinoquio_notificacoes" ON public.pinoquio_notificacoes
  FOR UPDATE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY "tenant_admin_delete_pinoquio_notificacoes" ON public.pinoquio_notificacoes
  FOR DELETE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
  );

-- =====================================================
-- TABELA: pinoquio_execucoes
-- =====================================================
CREATE TABLE public.pinoquio_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  executado_em timestamptz NOT NULL DEFAULT now(),
  total_pendentes integer NOT NULL DEFAULT 0,
  total_novos_enviados integer NOT NULL DEFAULT 0,
  total_erros integer NOT NULL DEFAULT 0,
  total_ignorados integer NOT NULL DEFAULT 0
);

ALTER TABLE public.pinoquio_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_pinoquio_execucoes" ON public.pinoquio_execucoes
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;