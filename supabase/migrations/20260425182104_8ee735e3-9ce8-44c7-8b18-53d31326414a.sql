
-- 1) Add gender column to contatos
ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS genero text;

ALTER TABLE public.contatos
  DROP CONSTRAINT IF EXISTS contatos_genero_check;

ALTER TABLE public.contatos
  ADD CONSTRAINT contatos_genero_check
  CHECK (genero IS NULL OR genero IN ('masculino','feminino','outro','nao_informado'));

-- 2) Report function: returns aggregated metrics for the giftback report.
CREATE OR REPLACE FUNCTION public.relatorio_giftback(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_atendente_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_result jsonb;
  v_receita_total numeric;
  v_num_vendas integer;
  v_clientes_unicos integer;
  v_giftback_usado_total numeric;
  v_receita_giftback numeric;
  v_receita_influenciada numeric;
  v_ticket_medio numeric;
  v_pct_retorno numeric;
  v_freq_media numeric;
  v_faturamento_mensal jsonb;
  v_compras_genero jsonb;
BEGIN
  v_tenant := public.get_user_tenant_id(auth.uid());
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('error', 'no_tenant');
  END IF;

  -- Core aggregates over filtered compras
  WITH base AS (
    SELECT c.*
    FROM public.compras c
    WHERE c.tenant_id = v_tenant
      AND c.created_at >= p_inicio
      AND c.created_at < p_fim
      AND (p_atendente_id IS NULL OR c.operador_id = p_atendente_id)
  )
  SELECT
    COALESCE(SUM(valor), 0),
    COUNT(*),
    COUNT(DISTINCT contato_id),
    COALESCE(SUM(giftback_usado), 0),
    COALESCE(SUM(CASE WHEN COALESCE(giftback_usado,0) > 0 OR COALESCE(giftback_gerado,0) > 0 THEN valor ELSE 0 END), 0)
  INTO v_receita_total, v_num_vendas, v_clientes_unicos, v_giftback_usado_total, v_receita_giftback
  FROM base;

  -- Receita influenciada: compra de contato que recebeu nos 30 dias antes:
  --  (a) campanha enviada, (b) comunicação giftback enviada (não-teste), (c) sessão de fluxo criada
  SELECT COALESCE(SUM(c.valor), 0) INTO v_receita_influenciada
  FROM public.compras c
  WHERE c.tenant_id = v_tenant
    AND c.created_at >= p_inicio
    AND c.created_at < p_fim
    AND (p_atendente_id IS NULL OR c.operador_id = p_atendente_id)
    AND (
      EXISTS (
        SELECT 1 FROM public.campanha_destinatarios cd
        WHERE cd.tenant_id = v_tenant
          AND cd.contato_id = c.contato_id
          AND cd.status = 'enviado'
          AND cd.enviado_at IS NOT NULL
          AND cd.enviado_at <= c.created_at
          AND cd.enviado_at >= c.created_at - interval '30 days'
      )
      OR EXISTS (
        SELECT 1 FROM public.giftback_comunicacao_log gl
        WHERE gl.tenant_id = v_tenant
          AND gl.contato_id = c.contato_id
          AND gl.status = 'enviado'
          AND gl.is_teste = false
          AND gl.enviado_em <= c.created_at
          AND gl.enviado_em >= c.created_at - interval '30 days'
      )
      OR EXISTS (
        SELECT 1 FROM public.fluxo_sessoes fs
        JOIN public.conversas conv ON conv.id = fs.conversa_id
        WHERE fs.tenant_id = v_tenant
          AND conv.contato_id = c.contato_id
          AND fs.created_at <= c.created_at
          AND fs.created_at >= c.created_at - interval '30 days'
      )
    );

  v_ticket_medio := CASE WHEN v_num_vendas > 0 THEN v_receita_total / v_num_vendas ELSE 0 END;
  v_pct_retorno := CASE WHEN v_receita_total > 0 THEN (v_giftback_usado_total / v_receita_total) * 100 ELSE 0 END;
  v_freq_media := CASE WHEN v_clientes_unicos > 0 THEN v_num_vendas::numeric / v_clientes_unicos ELSE 0 END;

  -- Faturamento por mês (últimos 12 meses cheios incluindo o atual)
  WITH meses AS (
    SELECT generate_series(
      date_trunc('month', now()) - interval '11 months',
      date_trunc('month', now()),
      interval '1 month'
    ) AS mes
  ),
  somas AS (
    SELECT date_trunc('month', c.created_at) AS mes, SUM(c.valor) AS valor
    FROM public.compras c
    WHERE c.tenant_id = v_tenant
      AND c.created_at >= date_trunc('month', now()) - interval '11 months'
      AND (p_atendente_id IS NULL OR c.operador_id = p_atendente_id)
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'mes', to_char(m.mes, 'YYYY-MM'),
    'valor', COALESCE(s.valor, 0)
  ) ORDER BY m.mes), '[]'::jsonb)
  INTO v_faturamento_mensal
  FROM meses m
  LEFT JOIN somas s ON s.mes = m.mes;

  -- Compras por gênero (no período filtrado)
  WITH base AS (
    SELECT c.id, COALESCE(ct.genero, 'nao_informado') AS genero
    FROM public.compras c
    LEFT JOIN public.contatos ct ON ct.id = c.contato_id
    WHERE c.tenant_id = v_tenant
      AND c.created_at >= p_inicio
      AND c.created_at < p_fim
      AND (p_atendente_id IS NULL OR c.operador_id = p_atendente_id)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('genero', genero, 'total', total) ORDER BY total DESC), '[]'::jsonb)
  INTO v_compras_genero
  FROM (SELECT genero, COUNT(*)::int AS total FROM base GROUP BY genero) g;

  v_result := jsonb_build_object(
    'receita_total', v_receita_total,
    'receita_influenciada', v_receita_influenciada,
    'receita_giftback', v_receita_giftback,
    'num_vendas', v_num_vendas,
    'clientes_unicos', v_clientes_unicos,
    'ticket_medio', v_ticket_medio,
    'percentual_retorno', v_pct_retorno,
    'frequencia_media', v_freq_media,
    'faturamento_mensal', v_faturamento_mensal,
    'compras_por_genero', v_compras_genero
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.relatorio_giftback(timestamptz, timestamptz, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.relatorio_giftback(timestamptz, timestamptz, uuid) TO authenticated;
