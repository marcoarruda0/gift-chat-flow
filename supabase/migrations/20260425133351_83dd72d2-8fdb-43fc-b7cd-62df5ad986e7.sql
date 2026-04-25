-- Enum para tipos de gatilho
DO $$ BEGIN
  CREATE TYPE public.gb_gatilho_tipo AS ENUM ('criado', 'vencendo', 'expirado');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============= 1. Config geral por tenant =============
CREATE TABLE public.giftback_comunicacao_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  horario_envio time NOT NULL DEFAULT '09:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.giftback_comunicacao_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_gb_com_config" ON public.giftback_comunicacao_config
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_insert_gb_com_config" ON public.giftback_comunicacao_config
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE POLICY "tenant_admin_update_gb_com_config" ON public.giftback_comunicacao_config
  FOR UPDATE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE POLICY "tenant_admin_delete_gb_com_config" ON public.giftback_comunicacao_config
  FOR DELETE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE TRIGGER trg_gb_com_config_updated
  BEFORE UPDATE ON public.giftback_comunicacao_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= 2. Regras de comunicação =============
CREATE TABLE public.giftback_comunicacao_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  tipo_gatilho public.gb_gatilho_tipo NOT NULL,
  dias_offset integer NOT NULL DEFAULT 0,
  template_name text NOT NULL,
  template_language text NOT NULL DEFAULT 'pt_BR',
  template_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  template_variaveis jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gb_com_regras_lookup
  ON public.giftback_comunicacao_regras (tenant_id, ativo, tipo_gatilho, dias_offset);

ALTER TABLE public.giftback_comunicacao_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_gb_com_regras" ON public.giftback_comunicacao_regras
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_insert_gb_com_regras" ON public.giftback_comunicacao_regras
  FOR INSERT WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE POLICY "tenant_admin_update_gb_com_regras" ON public.giftback_comunicacao_regras
  FOR UPDATE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE POLICY "tenant_admin_delete_gb_com_regras" ON public.giftback_comunicacao_regras
  FOR DELETE USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'admin_tenant'::app_role) OR has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE TRIGGER trg_gb_com_regras_updated
  BEFORE UPDATE ON public.giftback_comunicacao_regras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= 3. Log/histórico de envios =============
CREATE TABLE public.giftback_comunicacao_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  regra_id uuid NOT NULL,
  movimento_id uuid NOT NULL,
  contato_id uuid NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  wa_message_id text,
  erro text,
  CONSTRAINT uniq_regra_movimento UNIQUE (regra_id, movimento_id)
);

CREATE INDEX idx_gb_com_log_tenant_data
  ON public.giftback_comunicacao_log (tenant_id, enviado_em DESC);

ALTER TABLE public.giftback_comunicacao_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_gb_com_log" ON public.giftback_comunicacao_log
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Inserts são feitos pela edge function (service role bypassa RLS).
-- Usuários comuns não inserem/alteram/deletam manualmente.