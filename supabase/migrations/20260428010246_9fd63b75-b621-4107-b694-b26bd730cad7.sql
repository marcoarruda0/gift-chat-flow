
-- ===== 1. Opt-out / LGPD =====
ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS opt_out_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opt_out_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_contatos_opt_out
  ON public.contatos(tenant_id) WHERE opt_out_whatsapp = true;

-- Tabela de tokens públicos para descadastro
CREATE TABLE IF NOT EXISTS public.optout_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contato_id uuid NOT NULL,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  campanha_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_optout_tokens_token ON public.optout_tokens(token);
CREATE INDEX IF NOT EXISTS idx_optout_tokens_contato ON public.optout_tokens(tenant_id, contato_id);

ALTER TABLE public.optout_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_optout_tokens" ON public.optout_tokens
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_insert_optout_tokens" ON public.optout_tokens
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- LGPD: configurações por tenant (política, branding do link)
CREATE TABLE IF NOT EXISTS public.lgpd_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE,
  politica_privacidade_url text,
  texto_descadastro text DEFAULT 'Para parar de receber mensagens, clique aqui: {{opt_out_url}}',
  incluir_link_automatico boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lgpd_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_lgpd_config" ON public.lgpd_config
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_insert_lgpd_config" ON public.lgpd_config
  FOR INSERT WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin_tenant'::app_role) OR public.has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE POLICY "tenant_admin_update_lgpd_config" ON public.lgpd_config
  FOR UPDATE USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin_tenant'::app_role) OR public.has_role(auth.uid(), 'admin_master'::app_role))
  );

CREATE TRIGGER update_lgpd_config_updated_at
  BEFORE UPDATE ON public.lgpd_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== 2. Agendamento =====
CREATE INDEX IF NOT EXISTS idx_campanhas_agendadas
  ON public.campanhas(tenant_id, status, agendada_para)
  WHERE status = 'agendada';

-- Adicionar valor 'optout' ao enum destinatario_status (auditoria de quem foi pulado)
DO $$ BEGIN
  ALTER TYPE public.destinatario_status ADD VALUE IF NOT EXISTS 'optout';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 3. Timeline unificada =====
CREATE OR REPLACE FUNCTION public.contato_timeline(p_contato_id uuid, p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_contato_tenant uuid;
  v_result jsonb;
BEGIN
  v_tenant := public.get_user_tenant_id(auth.uid());
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('error', 'no_tenant');
  END IF;

  SELECT tenant_id INTO v_contato_tenant FROM public.contatos WHERE id = p_contato_id;
  IF v_contato_tenant IS NULL OR v_contato_tenant <> v_tenant THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  WITH eventos AS (
    -- Compras
    SELECT
      c.created_at AS ts,
      'compra'::text AS tipo,
      'Compra realizada'::text AS titulo,
      ('Valor: R$ ' || to_char(c.valor, 'FM999G999G990D00'))::text AS descricao,
      c.valor AS valor,
      c.id AS ref_id,
      jsonb_build_object(
        'giftback_gerado', COALESCE(c.giftback_gerado, 0),
        'giftback_usado', COALESCE(c.giftback_usado, 0),
        'operador_id', c.operador_id
      ) AS metadata
    FROM public.compras c
    WHERE c.contato_id = p_contato_id AND c.tenant_id = v_tenant

    UNION ALL

    -- Giftback
    SELECT
      gm.created_at AS ts,
      ('giftback_' || gm.tipo)::text AS tipo,
      CASE gm.tipo::text
        WHEN 'credito' THEN 'Giftback creditado'
        WHEN 'debito' THEN 'Giftback utilizado'
        WHEN 'expirado' THEN 'Giftback expirado'
        ELSE 'Movimento giftback'
      END AS titulo,
      ('R$ ' || to_char(gm.valor, 'FM999G999G990D00') ||
        CASE WHEN gm.validade IS NOT NULL THEN ' · validade ' || to_char(gm.validade, 'DD/MM/YYYY') ELSE '' END
      )::text AS descricao,
      gm.valor AS valor,
      gm.id AS ref_id,
      jsonb_build_object('status', gm.status, 'segmento_rfv', gm.segmento_rfv, 'compra_id', gm.compra_id) AS metadata
    FROM public.giftback_movimentos gm
    WHERE gm.contato_id = p_contato_id AND gm.tenant_id = v_tenant

    UNION ALL

    -- Mensagens (resumido por dia)
    SELECT
      max(m.created_at) AS ts,
      'mensagem'::text AS tipo,
      ('Conversa (' || count(*) || ' mensagens)')::text AS titulo,
      (left(string_agg(m.conteudo, ' | ' ORDER BY m.created_at DESC), 200))::text AS descricao,
      NULL::numeric AS valor,
      conv.id AS ref_id,
      jsonb_build_object('canal', conv.canal, 'total', count(*)) AS metadata
    FROM public.mensagens m
    JOIN public.conversas conv ON conv.id = m.conversa_id
    WHERE conv.contato_id = p_contato_id AND m.tenant_id = v_tenant
    GROUP BY date_trunc('day', m.created_at), conv.id, conv.canal

    UNION ALL

    -- Campanhas recebidas
    SELECT
      cd.enviado_at AS ts,
      'campanha'::text AS tipo,
      ('Campanha: ' || COALESCE(cmp.nome, 'sem nome'))::text AS titulo,
      ('Status: ' || cd.status)::text AS descricao,
      NULL::numeric AS valor,
      cd.id AS ref_id,
      jsonb_build_object('campanha_id', cmp.id, 'canal', cmp.canal) AS metadata
    FROM public.campanha_destinatarios cd
    JOIN public.campanhas cmp ON cmp.id = cd.campanha_id
    WHERE cd.contato_id = p_contato_id AND cd.tenant_id = v_tenant
      AND cd.enviado_at IS NOT NULL

    UNION ALL

    -- Comunicações de giftback (régua)
    SELECT
      gcl.enviado_em AS ts,
      'comunicacao_giftback'::text AS tipo,
      'Comunicação de Giftback'::text AS titulo,
      ('Status: ' || gcl.status)::text AS descricao,
      NULL::numeric AS valor,
      gcl.id AS ref_id,
      jsonb_build_object('regra_id', gcl.regra_id, 'is_teste', gcl.is_teste) AS metadata
    FROM public.giftback_comunicacao_log gcl
    WHERE gcl.contato_id = p_contato_id AND gcl.tenant_id = v_tenant
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ts', ts,
    'tipo', tipo,
    'titulo', titulo,
    'descricao', descricao,
    'valor', valor,
    'ref_id', ref_id,
    'metadata', metadata
  ) ORDER BY ts DESC), '[]'::jsonb)
  INTO v_result
  FROM (SELECT * FROM eventos WHERE ts IS NOT NULL ORDER BY ts DESC LIMIT p_limit) e;

  RETURN jsonb_build_object('eventos', v_result);
END;
$$;
