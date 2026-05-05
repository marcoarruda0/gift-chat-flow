
-- Tabela de saldos consignado (fornecedores)
CREATE TABLE public.saldos_consignado (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  loja_id INTEGER,
  loja_nome TEXT,
  fornecedor_id_externo BIGINT,
  codigo_maqplan TEXT,
  nome TEXT,
  email TEXT,
  telefone TEXT,
  celular TEXT,
  cpf_cnpj TEXT,
  representante TEXT,
  interno INTEGER,
  numero_contrato TEXT,
  saldo_bloqueado NUMERIC NOT NULL DEFAULT 0,
  saldo_liberado NUMERIC NOT NULL DEFAULT 0,
  saldo_total NUMERIC NOT NULL DEFAULT 0,
  data_cadastro TIMESTAMP WITH TIME ZONE,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_saldos_consignado_tenant_cpf ON public.saldos_consignado (tenant_id, cpf_cnpj);
CREATE INDEX idx_saldos_consignado_tenant ON public.saldos_consignado (tenant_id);

ALTER TABLE public.saldos_consignado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_saldos_consignado"
  ON public.saldos_consignado FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.has_role(auth.uid(), 'admin_master'));

CREATE POLICY "tenant_admin_insert_saldos_consignado"
  ON public.saldos_consignado FOR INSERT
  WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))) OR public.has_role(auth.uid(), 'admin_master'));

CREATE POLICY "tenant_admin_delete_saldos_consignado"
  ON public.saldos_consignado FOR DELETE
  USING ((tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))) OR public.has_role(auth.uid(), 'admin_master'));

-- Tabela de saldos moeda PR (clientes)
CREATE TABLE public.saldos_moeda_pr (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  cliente_id_externo BIGINT,
  nome TEXT,
  cpf_cnpj TEXT,
  email TEXT,
  telefone TEXT,
  loja TEXT,
  saldo NUMERIC NOT NULL DEFAULT 0,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_saldos_moeda_pr_tenant_cpf ON public.saldos_moeda_pr (tenant_id, cpf_cnpj);
CREATE INDEX idx_saldos_moeda_pr_tenant ON public.saldos_moeda_pr (tenant_id);

ALTER TABLE public.saldos_moeda_pr ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_saldos_moeda_pr"
  ON public.saldos_moeda_pr FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.has_role(auth.uid(), 'admin_master'));

CREATE POLICY "tenant_admin_insert_saldos_moeda_pr"
  ON public.saldos_moeda_pr FOR INSERT
  WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))) OR public.has_role(auth.uid(), 'admin_master'));

CREATE POLICY "tenant_admin_delete_saldos_moeda_pr"
  ON public.saldos_moeda_pr FOR DELETE
  USING ((tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))) OR public.has_role(auth.uid(), 'admin_master'));

-- Tabela de log de uploads
CREATE TABLE public.saldos_uploads_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  tipo TEXT NOT NULL,
  arquivo_nome TEXT,
  total_linhas INTEGER NOT NULL DEFAULT 0,
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_saldos_uploads_log_tenant ON public.saldos_uploads_log (tenant_id, tipo, created_at DESC);

ALTER TABLE public.saldos_uploads_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_saldos_uploads_log"
  ON public.saldos_uploads_log FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.has_role(auth.uid(), 'admin_master'));

CREATE POLICY "tenant_admin_insert_saldos_uploads_log"
  ON public.saldos_uploads_log FOR INSERT
  WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))) OR public.has_role(auth.uid(), 'admin_master'));
