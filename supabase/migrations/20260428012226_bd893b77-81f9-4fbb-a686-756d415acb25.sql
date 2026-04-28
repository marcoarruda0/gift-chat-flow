
-- Enums
DO $$ BEGIN
  CREATE TYPE public.satisfacao_classificacao AS ENUM (
    'muito_insatisfeito','insatisfeito','neutro','satisfeito','muito_satisfeito'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.satisfacao_sentimento AS ENUM ('positivo','neutro','negativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Estender ia_config
ALTER TABLE public.ia_config
  ADD COLUMN IF NOT EXISTS satisfacao_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS satisfacao_criterios text DEFAULT '',
  ADD COLUMN IF NOT EXISTS satisfacao_min_mensagens_cliente integer NOT NULL DEFAULT 2;

-- Tabela principal
CREATE TABLE IF NOT EXISTS public.atendimento_satisfacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversa_id uuid NOT NULL UNIQUE,
  contato_id uuid,
  atendente_id uuid,
  departamento_id uuid,
  canal text NOT NULL,
  classificacao public.satisfacao_classificacao,
  score smallint CHECK (score IS NULL OR (score BETWEEN 1 AND 5)),
  sentimento public.satisfacao_sentimento,
  justificativa text,
  pontos_positivos text[] DEFAULT '{}',
  pontos_negativos text[] DEFAULT '{}',
  total_mensagens_cliente integer DEFAULT 0,
  total_mensagens_atendente integer DEFAULT 0,
  primeiro_resp_segundos integer,
  tempo_medio_resposta_segundos integer,
  duracao_segundos integer,
  houve_transferencia boolean DEFAULT false,
  terminou_sem_resposta boolean DEFAULT false,
  status text NOT NULL DEFAULT 'pendente',
  motivo_ignorado text,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_satisfacao_tenant_created
  ON public.atendimento_satisfacao (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_satisfacao_status
  ON public.atendimento_satisfacao (status) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_satisfacao_atendente
  ON public.atendimento_satisfacao (atendente_id, created_at DESC);

ALTER TABLE public.atendimento_satisfacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_view_satisfacao ON public.atendimento_satisfacao;
CREATE POLICY tenant_view_satisfacao ON public.atendimento_satisfacao
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS tenant_admin_delete_satisfacao ON public.atendimento_satisfacao;
CREATE POLICY tenant_admin_delete_satisfacao ON public.atendimento_satisfacao
  FOR DELETE USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin_tenant') OR public.has_role(auth.uid(),'admin_master'))
  );

-- Trigger para enfileirar
CREATE OR REPLACE FUNCTION public.enfileirar_analise_satisfacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.atendimento_encerrado_at IS NOT NULL
     AND (OLD.atendimento_encerrado_at IS NULL OR OLD.atendimento_encerrado_at IS DISTINCT FROM NEW.atendimento_encerrado_at)
     AND NEW.canal IN ('zapi','whatsapp_cloud') THEN
    INSERT INTO public.atendimento_satisfacao (
      tenant_id, conversa_id, contato_id, atendente_id, departamento_id, canal, status
    ) VALUES (
      NEW.tenant_id, NEW.id, NEW.contato_id, NEW.atendente_id, NEW.departamento_id, NEW.canal, 'pendente'
    )
    ON CONFLICT (conversa_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enfileirar_satisfacao ON public.conversas;
CREATE TRIGGER trg_enfileirar_satisfacao
  AFTER UPDATE ON public.conversas
  FOR EACH ROW
  EXECUTE FUNCTION public.enfileirar_analise_satisfacao();

-- Função de relatório
CREATE OR REPLACE FUNCTION public.relatorio_satisfacao(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_atendente_id uuid DEFAULT NULL,
  p_departamento_id uuid DEFAULT NULL,
  p_canal text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_total int;
  v_concluidos int;
  v_ignorados int;
  v_erros int;
  v_score_medio numeric;
  v_dist jsonb;
  v_evolucao jsonb;
  v_ranking jsonb;
  v_tempo_medio_resp numeric;
  v_pontos_neg jsonb;
  v_recentes jsonb;
  v_ant_inicio timestamptz;
  v_ant_fim timestamptz;
  v_score_medio_ant numeric;
BEGIN
  v_tenant := public.get_user_tenant_id(auth.uid());
  IF v_tenant IS NULL THEN RETURN jsonb_build_object('error','no_tenant'); END IF;

  v_ant_fim := p_inicio;
  v_ant_inicio := p_inicio - (p_fim - p_inicio);

  WITH base AS (
    SELECT * FROM public.atendimento_satisfacao s
    WHERE s.tenant_id = v_tenant
      AND s.created_at >= p_inicio AND s.created_at < p_fim
      AND (p_atendente_id IS NULL OR s.atendente_id = p_atendente_id)
      AND (p_departamento_id IS NULL OR s.departamento_id = p_departamento_id)
      AND (p_canal IS NULL OR s.canal = p_canal)
  )
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE status='concluido')::int,
    count(*) FILTER (WHERE status='ignorado')::int,
    count(*) FILTER (WHERE status='erro')::int,
    COALESCE(AVG(score) FILTER (WHERE status='concluido'),0)::numeric,
    COALESCE(AVG(primeiro_resp_segundos) FILTER (WHERE status='concluido'),0)::numeric
  INTO v_total, v_concluidos, v_ignorados, v_erros, v_score_medio, v_tempo_medio_resp
  FROM base;

  -- período anterior (só score)
  SELECT COALESCE(AVG(score),0)::numeric INTO v_score_medio_ant
  FROM public.atendimento_satisfacao
  WHERE tenant_id = v_tenant
    AND created_at >= v_ant_inicio AND created_at < v_ant_fim
    AND status = 'concluido'
    AND (p_atendente_id IS NULL OR atendente_id = p_atendente_id)
    AND (p_departamento_id IS NULL OR departamento_id = p_departamento_id)
    AND (p_canal IS NULL OR canal = p_canal);

  -- distribuição
  SELECT COALESCE(jsonb_agg(jsonb_build_object('classificacao', classificacao, 'total', total) ORDER BY classificacao), '[]'::jsonb)
  INTO v_dist
  FROM (
    SELECT classificacao::text AS classificacao, count(*)::int AS total
    FROM public.atendimento_satisfacao
    WHERE tenant_id = v_tenant
      AND created_at >= p_inicio AND created_at < p_fim
      AND status='concluido'
      AND (p_atendente_id IS NULL OR atendente_id = p_atendente_id)
      AND (p_departamento_id IS NULL OR departamento_id = p_departamento_id)
      AND (p_canal IS NULL OR canal = p_canal)
    GROUP BY classificacao
  ) d;

  -- evolução por dia
  SELECT COALESCE(jsonb_agg(jsonb_build_object('dia', dia, 'score', score, 'total', total) ORDER BY dia), '[]'::jsonb)
  INTO v_evolucao
  FROM (
    SELECT to_char(date_trunc('day', created_at),'YYYY-MM-DD') AS dia,
           AVG(score)::numeric(10,2) AS score,
           count(*)::int AS total
    FROM public.atendimento_satisfacao
    WHERE tenant_id = v_tenant
      AND created_at >= p_inicio AND created_at < p_fim
      AND status='concluido'
      AND (p_atendente_id IS NULL OR atendente_id = p_atendente_id)
      AND (p_departamento_id IS NULL OR departamento_id = p_departamento_id)
      AND (p_canal IS NULL OR canal = p_canal)
    GROUP BY 1
  ) e;

  -- ranking atendentes
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'atendente_id', atendente_id,
    'nome', nome,
    'score', score,
    'total', total
  ) ORDER BY score DESC), '[]'::jsonb)
  INTO v_ranking
  FROM (
    SELECT s.atendente_id,
           COALESCE(p.nome,'Sem nome') AS nome,
           AVG(s.score)::numeric(10,2) AS score,
           count(*)::int AS total
    FROM public.atendimento_satisfacao s
    LEFT JOIN public.profiles p ON p.id = s.atendente_id
    WHERE s.tenant_id = v_tenant
      AND s.created_at >= p_inicio AND s.created_at < p_fim
      AND s.status='concluido'
      AND s.atendente_id IS NOT NULL
      AND (p_atendente_id IS NULL OR s.atendente_id = p_atendente_id)
      AND (p_departamento_id IS NULL OR s.departamento_id = p_departamento_id)
      AND (p_canal IS NULL OR s.canal = p_canal)
    GROUP BY s.atendente_id, p.nome
    ORDER BY score DESC
    LIMIT 20
  ) r;

  -- pontos negativos top
  SELECT COALESCE(jsonb_agg(jsonb_build_object('ponto', ponto, 'total', total) ORDER BY total DESC), '[]'::jsonb)
  INTO v_pontos_neg
  FROM (
    SELECT lower(trim(p)) AS ponto, count(*)::int AS total
    FROM public.atendimento_satisfacao s, unnest(s.pontos_negativos) AS p
    WHERE s.tenant_id = v_tenant
      AND s.created_at >= p_inicio AND s.created_at < p_fim
      AND s.status='concluido'
      AND (p_atendente_id IS NULL OR s.atendente_id = p_atendente_id)
      AND (p_departamento_id IS NULL OR s.departamento_id = p_departamento_id)
      AND (p_canal IS NULL OR s.canal = p_canal)
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 10
  ) pn;

  -- recentes (até 50)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'created_at', s.created_at,
    'contato_id', s.contato_id,
    'contato_nome', c.nome,
    'atendente_id', s.atendente_id,
    'atendente_nome', p.nome,
    'canal', s.canal,
    'classificacao', s.classificacao,
    'score', s.score,
    'sentimento', s.sentimento,
    'justificativa', s.justificativa,
    'primeiro_resp_segundos', s.primeiro_resp_segundos,
    'tempo_medio_resposta_segundos', s.tempo_medio_resposta_segundos,
    'duracao_segundos', s.duracao_segundos,
    'houve_transferencia', s.houve_transferencia,
    'terminou_sem_resposta', s.terminou_sem_resposta,
    'pontos_positivos', s.pontos_positivos,
    'pontos_negativos', s.pontos_negativos,
    'conversa_id', s.conversa_id,
    'status', s.status
  ) ORDER BY s.created_at DESC), '[]'::jsonb)
  INTO v_recentes
  FROM (
    SELECT * FROM public.atendimento_satisfacao s
    WHERE s.tenant_id = v_tenant
      AND s.created_at >= p_inicio AND s.created_at < p_fim
      AND (p_atendente_id IS NULL OR s.atendente_id = p_atendente_id)
      AND (p_departamento_id IS NULL OR s.departamento_id = p_departamento_id)
      AND (p_canal IS NULL OR s.canal = p_canal)
    ORDER BY created_at DESC
    LIMIT 50
  ) s
  LEFT JOIN public.contatos c ON c.id = s.contato_id
  LEFT JOIN public.profiles p ON p.id = s.atendente_id;

  RETURN jsonb_build_object(
    'total', v_total,
    'concluidos', v_concluidos,
    'ignorados', v_ignorados,
    'erros', v_erros,
    'score_medio', v_score_medio,
    'score_medio_anterior', v_score_medio_ant,
    'tempo_medio_primeira_resp_segundos', v_tempo_medio_resp,
    'distribuicao', v_dist,
    'evolucao', v_evolucao,
    'ranking_atendentes', v_ranking,
    'pontos_negativos_top', v_pontos_neg,
    'recentes', v_recentes,
    'comparativo', jsonb_build_object('inicio_anterior', v_ant_inicio, 'fim_anterior', v_ant_fim)
  );
END;
$$;

-- Atualizar contato_timeline para incluir satisfação
CREATE OR REPLACE FUNCTION public.contato_timeline(p_contato_id uuid, p_limit integer DEFAULT 100)
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
    SELECT c.created_at AS ts, 'compra'::text AS tipo, 'Compra realizada'::text AS titulo,
      ('Valor: R$ ' || to_char(c.valor,'FM999G999G990D00'))::text AS descricao,
      c.valor AS valor, c.id AS ref_id,
      jsonb_build_object('giftback_gerado', COALESCE(c.giftback_gerado,0),
        'giftback_usado', COALESCE(c.giftback_usado,0), 'operador_id', c.operador_id) AS metadata
    FROM public.compras c
    WHERE c.contato_id = p_contato_id AND c.tenant_id = v_tenant

    UNION ALL
    SELECT gm.created_at, ('giftback_'||gm.tipo)::text,
      CASE gm.tipo::text WHEN 'credito' THEN 'Giftback creditado' WHEN 'debito' THEN 'Giftback utilizado'
        WHEN 'expirado' THEN 'Giftback expirado' ELSE 'Movimento giftback' END,
      ('R$ '||to_char(gm.valor,'FM999G999G990D00')||
        CASE WHEN gm.validade IS NOT NULL THEN ' · validade '||to_char(gm.validade,'DD/MM/YYYY') ELSE '' END)::text,
      gm.valor, gm.id,
      jsonb_build_object('status', gm.status, 'segmento_rfv', gm.segmento_rfv, 'compra_id', gm.compra_id)
    FROM public.giftback_movimentos gm
    WHERE gm.contato_id = p_contato_id AND gm.tenant_id = v_tenant

    UNION ALL
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
    SELECT cd.enviado_at, 'campanha'::text,
      ('Campanha: '||COALESCE(cmp.nome,'sem nome'))::text,
      ('Status: '||cd.status)::text, NULL::numeric, cd.id,
      jsonb_build_object('campanha_id', cmp.id, 'canal', cmp.canal)
    FROM public.campanha_destinatarios cd
    JOIN public.campanhas cmp ON cmp.id = cd.campanha_id
    WHERE cd.contato_id = p_contato_id AND cd.tenant_id = v_tenant AND cd.enviado_at IS NOT NULL

    UNION ALL
    SELECT gcl.enviado_em, 'comunicacao_giftback'::text, 'Comunicação de Giftback'::text,
      ('Status: '||gcl.status)::text, NULL::numeric, gcl.id,
      jsonb_build_object('regra_id', gcl.regra_id, 'is_teste', gcl.is_teste)
    FROM public.giftback_comunicacao_log gcl
    WHERE gcl.contato_id = p_contato_id AND gcl.tenant_id = v_tenant

    UNION ALL
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
