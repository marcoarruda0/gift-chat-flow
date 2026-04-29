
-- Enriquecer contato_timeline com fluxos e detalhes ricos de giftback/campanha; adicionar contato_resumo

CREATE OR REPLACE FUNCTION public.contato_timeline(p_contato_id uuid, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_contato_tenant uuid;
  v_result jsonb;
BEGIN
  v_tenant := public.get_user_tenant_id(auth.uid());
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('error','no_tenant'); END IF;

  SELECT tenant_id INTO v_contato_tenant FROM public.contatos WHERE id = p_contato_id;
  IF v_contato_tenant IS NULL OR v_contato_tenant <> v_tenant THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  WITH eventos AS (
    -- COMPRAS
    SELECT c.created_at AS ts, 'compra'::text AS tipo, 'Compra realizada'::text AS titulo,
      ('Valor: R$ ' || to_char(c.valor,'FM999G999G990D00'))::text AS descricao,
      c.valor AS valor, c.id AS ref_id,
      jsonb_build_object(
        'giftback_gerado', COALESCE(c.giftback_gerado,0),
        'giftback_usado', COALESCE(c.giftback_usado,0),
        'operador_id', c.operador_id,
        'operador_nome', (SELECT nome FROM public.profiles WHERE id = c.operador_id)
      ) AS metadata
    FROM public.compras c
    WHERE c.contato_id = p_contato_id AND c.tenant_id = v_tenant

    UNION ALL
    -- GIFTBACK (com detalhes: código curto, validade, status efetivo)
    SELECT gm.created_at,
      ('giftback_'||gm.tipo)::text,
      CASE gm.tipo::text
        WHEN 'credito' THEN 'Giftback Gerado'
        WHEN 'debito' THEN 'Giftback Utilizado'
        WHEN 'expirado' THEN 'Giftback Expirado'
        ELSE 'Movimento de Giftback'
      END,
      ('R$ '||to_char(gm.valor,'FM999G999G990D00')||
        CASE WHEN gm.validade IS NOT NULL THEN ' · validade '||to_char(gm.validade,'DD/MM/YYYY') ELSE '' END)::text,
      gm.valor, gm.id,
      jsonb_build_object(
        'status', gm.status,
        'segmento_rfv', gm.segmento_rfv,
        'compra_id', gm.compra_id,
        'codigo', substr(replace(gm.id::text,'-',''),1,8),
        'validade', gm.validade,
        'percentual', gm.regra_percentual,
        'usado', EXISTS (
          SELECT 1 FROM public.giftback_movimentos x
          WHERE x.tenant_id = v_tenant AND x.contato_id = gm.contato_id
            AND x.tipo = 'debito' AND x.compra_id = gm.compra_id AND gm.tipo = 'credito'
        ),
        'expirado', (gm.tipo = 'credito' AND gm.status = 'expirado')
      )
    FROM public.giftback_movimentos gm
    WHERE gm.contato_id = p_contato_id AND gm.tenant_id = v_tenant

    UNION ALL
    -- CONVERSAS (agrupadas por dia)
    SELECT max(m.created_at), 'mensagem'::text,
      ('Conversa ('||count(*)||' mensagens)')::text,
      (left(string_agg(m.conteudo,' | ' ORDER BY m.created_at DESC),200))::text,
      NULL::numeric, conv.id,
      jsonb_build_object('canal', conv.canal, 'total', count(*))
    FROM public.mensagens m
    JOIN public.conversas conv ON conv.id = m.conversa_id
    WHERE conv.contato_id = p_contato_id AND m.tenant_id = v_tenant
    GROUP BY date_trunc('day', m.created_at), conv.id, conv.canal

    UNION ALL
    -- CAMPANHAS
    SELECT cd.enviado_at, 'campanha'::text,
      'Impactado pela campanha'::text,
      ('Recebeu campanha "'||COALESCE(cmp.nome,'sem nome')||'"')::text,
      NULL::numeric, cd.id,
      jsonb_build_object(
        'campanha_id', cmp.id,
        'campanha_nome', cmp.nome,
        'canal', cmp.canal,
        'assunto', cmp.email_assunto,
        'status', cd.status,
        'template_name', cmp.template_name
      )
    FROM public.campanha_destinatarios cd
    JOIN public.campanhas cmp ON cmp.id = cd.campanha_id
    WHERE cd.contato_id = p_contato_id AND cd.tenant_id = v_tenant AND cd.enviado_at IS NOT NULL

    UNION ALL
    -- COMUNICAÇÕES DE GIFTBACK
    SELECT gcl.enviado_em, 'comunicacao_giftback'::text,
      'Comunicação de Giftback'::text,
      ('Status: '||gcl.status)::text, NULL::numeric, gcl.id,
      jsonb_build_object('regra_id', gcl.regra_id, 'is_teste', gcl.is_teste, 'status', gcl.status)
    FROM public.giftback_comunicacao_log gcl
    WHERE gcl.contato_id = p_contato_id AND gcl.tenant_id = v_tenant

    UNION ALL
    -- FLUXOS (entrou em fluxo X)
    SELECT fs.created_at, 'fluxo'::text,
      'Entrou em um fluxo'::text,
      ('Cliente entrou no fluxo "'||COALESCE(f.nome,'sem nome')||'"')::text,
      NULL::numeric, fs.id,
      jsonb_build_object(
        'fluxo_id', f.id,
        'fluxo_nome', f.nome,
        'conversa_id', conv.id,
        'node_atual', fs.node_atual
      )
    FROM public.fluxo_sessoes fs
    JOIN public.fluxos f ON f.id = fs.fluxo_id
    JOIN public.conversas conv ON conv.id = fs.conversa_id
    WHERE conv.contato_id = p_contato_id AND fs.tenant_id = v_tenant

    UNION ALL
    -- SATISFAÇÃO
    SELECT s.processado_em, 'satisfacao'::text,
      ('Satisfação: '||COALESCE(s.classificacao::text,'pendente'))::text,
      COALESCE(s.justificativa,'')::text,
      s.score::numeric, s.id,
      jsonb_build_object('sentimento', s.sentimento, 'canal', s.canal,
        'pontos_positivos', s.pontos_positivos, 'pontos_negativos', s.pontos_negativos)
    FROM public.atendimento_satisfacao s
    WHERE s.contato_id = p_contato_id AND s.tenant_id = v_tenant AND s.status='concluido'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ts', ts, 'tipo', tipo, 'titulo', titulo, 'descricao', descricao,
    'valor', valor, 'ref_id', ref_id, 'metadata', metadata
  ) ORDER BY ts DESC), '[]'::jsonb)
  INTO v_result
  FROM (SELECT * FROM eventos WHERE ts IS NOT NULL ORDER BY ts DESC LIMIT p_limit) e;

  RETURN jsonb_build_object('eventos', v_result);
END;
$function$;


-- Resumo (KPIs) do contato
CREATE OR REPLACE FUNCTION public.contato_resumo(p_contato_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_contato_tenant uuid;
  v_valor_gasto numeric;
  v_giftback_gerado numeric;
  v_num_compras integer;
  v_ticket_medio numeric;
  v_vendedor jsonb;
BEGIN
  v_tenant := public.get_user_tenant_id(auth.uid());
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('error','no_tenant'); END IF;

  SELECT tenant_id INTO v_contato_tenant FROM public.contatos WHERE id = p_contato_id;
  IF v_contato_tenant IS NULL OR v_contato_tenant <> v_tenant THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  SELECT
    COALESCE(SUM(valor), 0),
    COALESCE(SUM(giftback_gerado), 0),
    COUNT(*)::int
  INTO v_valor_gasto, v_giftback_gerado, v_num_compras
  FROM public.compras
  WHERE contato_id = p_contato_id AND tenant_id = v_tenant;

  v_ticket_medio := CASE WHEN v_num_compras > 0 THEN v_valor_gasto / v_num_compras ELSE 0 END;

  -- Vendedor principal: operador com mais compras para esse contato
  SELECT
    CASE WHEN COUNT(*) = 0 THEN 'null'::jsonb
    ELSE jsonb_build_object(
      'id', MAX(operador_id::text),
      'nome', MAX(nome),
      'num_compras', MAX(qtd)
    ) END
  INTO v_vendedor
  FROM (
    SELECT c.operador_id,
           COALESCE(p.nome, 'Sem nome') AS nome,
           COUNT(*)::int AS qtd
    FROM public.compras c
    LEFT JOIN public.profiles p ON p.id = c.operador_id
    WHERE c.contato_id = p_contato_id AND c.tenant_id = v_tenant
      AND c.operador_id IS NOT NULL
    GROUP BY c.operador_id, p.nome
    ORDER BY qtd DESC
    LIMIT 1
  ) r;

  RETURN jsonb_build_object(
    'valor_gasto', v_valor_gasto,
    'giftback_gerado', v_giftback_gerado,
    'num_compras', v_num_compras,
    'ticket_medio', v_ticket_medio,
    'vendedor_principal', v_vendedor
  );
END;
$function$;
