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
  v_anterior_inicio timestamptz;
  v_anterior_fim timestamptz;
  v_receita_total_ant numeric;
  v_receita_giftback_ant numeric;
  v_receita_influenciada_ant numeric;
  v_top_atendente jsonb;
  v_ticket_genero jsonb;
  v_ranking_meses jsonb;
BEGIN
  v_tenant := public.get_user_tenant_id(auth.uid());
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('error', 'no_tenant');
  END IF;

  -- Período anterior do mesmo tamanho, imediatamente antes
  v_anterior_fim := p_inicio;
  v_anterior_inicio := p_inicio - (p_fim - p_inicio);

  -- Core aggregates over filtered compras (período atual)
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

  -- Receita influenciada (período atual)
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

  -- Período anterior: receita total e receita giftback
  WITH base_ant AS (
    SELECT c.*
    FROM public.compras c
    WHERE c.tenant_id = v_tenant
      AND c.created_at >= v_anterior_inicio
      AND c.created_at < v_anterior_fim
      AND (p_atendente_id IS NULL OR c.operador_id = p_atendente_id)
  )
  SELECT
    COALESCE(SUM(valor), 0),
    COALESCE(SUM(CASE WHEN COALESCE(giftback_usado,0) > 0 OR COALESCE(giftback_gerado,0) > 0 THEN valor ELSE 0 END), 0)
  INTO v_receita_total_ant, v_receita_giftback_ant
  FROM base_ant;

  -- Período anterior: receita influenciada
  SELECT COALESCE(SUM(c.valor), 0) INTO v_receita_influenciada_ant
  FROM public.compras c
  WHERE c.tenant_id = v_tenant
    AND c.created_at >= v_anterior_inicio
    AND c.created_at < v_anterior_fim
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

  -- Top atendente (no período)
  WITH ranking AS (
    SELECT
      c.operador_id,
      COALESCE(p.nome, 'Sem nome') AS nome,
      SUM(c.valor) AS receita,
      COUNT(*)::int AS num_vendas
    FROM public.compras c
    LEFT JOIN public.profiles p ON p.id = c.operador_id
    WHERE c.tenant_id = v_tenant
      AND c.created_at >= p_inicio
      AND c.created_at < p_fim
      AND (p_atendente_id IS NULL OR c.operador_id = p_atendente_id)
      AND c.operador_id IS NOT NULL
    GROUP BY c.operador_id, p.nome
    ORDER BY receita DESC
    LIMIT 1
  )
  SELECT
    CASE WHEN COUNT(*) = 0 THEN 'null'::jsonb
    ELSE jsonb_build_object(
      'id', MAX(operador_id::text),
      'nome', MAX(nome),
      'receita', MAX(receita),
      'num_vendas', MAX(num_vendas)
    )
    END
  INTO v_top_atendente
  FROM ranking;

  -- Ticket médio por gênero (no período)
  WITH base AS (
    SELECT COALESCE(ct.genero, 'nao_informado') AS genero, c.valor
    FROM public.compras c
    LEFT JOIN public.contatos ct ON ct.id = c.contato_id
    WHERE c.tenant_id = v_tenant
      AND c.created_at >= p_inicio
      AND c.created_at < p_fim
      AND (p_atendente_id IS NULL OR c.operador_id = p_atendente_id)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'genero', genero,
    'ticket_medio', ticket_medio,
    'num_vendas', num_vendas
  ) ORDER BY ticket_medio DESC), '[]'::jsonb)
  INTO v_ticket_genero
  FROM (
    SELECT genero,
      AVG(valor)::numeric AS ticket_medio,
      COUNT(*)::int AS num_vendas
    FROM base
    GROUP BY genero
  ) tg;

  -- Ranking de meses dentro do período (top 3 por faturamento)
  WITH base AS (
    SELECT date_trunc('month', c.created_at) AS mes, SUM(c.valor) AS valor
    FROM public.compras c
    WHERE c.tenant_id = v_tenant
      AND c.created_at >= p_inicio
      AND c.created_at < p_fim
      AND (p_atendente_id IS NULL OR c.operador_id = p_atendente_id)
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 3
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'mes', to_char(mes, 'YYYY-MM'),
    'valor', valor
  ) ORDER BY valor DESC), '[]'::jsonb)
  INTO v_ranking_meses
  FROM base;

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
    'compras_por_genero', v_compras_genero,
    'comparativo', jsonb_build_object(
      'receita_total_anterior', v_receita_total_ant,
      'receita_influenciada_anterior', v_receita_influenciada_ant,
      'receita_giftback_anterior', v_receita_giftback_ant,
      'inicio_anterior', v_anterior_inicio,
      'fim_anterior', v_anterior_fim
    ),
    'top_atendente', v_top_atendente,
    'ticket_por_genero', v_ticket_genero,
    'ranking_meses_periodo', v_ranking_meses
  );

  RETURN v_result;
END;
$$;