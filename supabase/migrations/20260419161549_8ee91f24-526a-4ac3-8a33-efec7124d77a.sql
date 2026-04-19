
-- ============================================
-- Helper: tabela temporária com mapeamento dup_contato → canonico_contato
-- ============================================
CREATE TEMP TABLE _contato_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT id, tenant_id, telefone, created_at,
    ROW_NUMBER() OVER (PARTITION BY tenant_id, telefone ORDER BY created_at ASC, id ASC) AS rn
  FROM public.contatos WHERE telefone IS NOT NULL AND telefone <> ''
)
SELECT r.id AS dup_id, c.id AS canonico_id, r.tenant_id
FROM ranked r
JOIN ranked c ON c.tenant_id=r.tenant_id AND c.telefone=r.telefone AND c.rn=1
WHERE r.rn > 1;

-- ============================================
-- PASSO 1: Mesclar dados de contatos duplicados no canônico
-- ============================================
WITH agg AS (
  SELECT
    m.canonico_id,
    SUM(COALESCE(c.saldo_giftback, 0)) AS soma_saldo,
    array_agg(DISTINCT t) FILTER (WHERE t IS NOT NULL) AS tags_union,
    jsonb_object_agg(k, v) FILTER (WHERE k IS NOT NULL) AS campos_extras
  FROM _contato_map m
  JOIN public.contatos c ON c.id = m.dup_id
  LEFT JOIN LATERAL unnest(c.tags) AS t ON TRUE
  LEFT JOIN LATERAL jsonb_each(c.campos_personalizados) AS kv(k,v) ON TRUE
  GROUP BY m.canonico_id
)
UPDATE public.contatos c SET
  saldo_giftback = COALESCE(c.saldo_giftback, 0) + COALESCE(agg.soma_saldo, 0),
  tags = COALESCE((SELECT array_agg(DISTINCT u) FROM unnest(COALESCE(c.tags, '{}') || COALESCE(agg.tags_union, '{}')) u), '{}'),
  campos_personalizados = COALESCE(agg.campos_extras, '{}'::jsonb) || COALESCE(c.campos_personalizados, '{}'::jsonb)
FROM agg WHERE c.id = agg.canonico_id;

-- ============================================
-- PASSO 2: Garantir que cada contato canônico tem uma conversa
-- (cria conversa para canônico se ele não tiver mas o duplicado tinha)
-- ============================================
INSERT INTO public.conversas (tenant_id, contato_id, status, ultima_msg_at, created_at)
SELECT DISTINCT m.tenant_id, m.canonico_id, 'aberta',
       MAX(conv.ultima_msg_at), MIN(conv.created_at)
FROM _contato_map m
JOIN public.conversas conv ON conv.contato_id = m.dup_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.conversas c2 WHERE c2.contato_id = m.canonico_id
)
GROUP BY m.tenant_id, m.canonico_id
ON CONFLICT (tenant_id, contato_id) DO NOTHING;

-- ============================================
-- PASSO 3: Mover mensagens das conversas duplicadas para a conversa do canônico
-- ============================================
CREATE TEMP TABLE _conv_map ON COMMIT DROP AS
SELECT
  conv_dup.id AS dup_conv_id,
  conv_can.id AS canonico_conv_id,
  m.canonico_id AS canonico_contato_id
FROM _contato_map m
JOIN public.conversas conv_dup ON conv_dup.contato_id = m.dup_id
JOIN public.conversas conv_can ON conv_can.contato_id = m.canonico_id;

UPDATE public.mensagens msg SET conversa_id = cm.canonico_conv_id
FROM _conv_map cm WHERE msg.conversa_id = cm.dup_conv_id;

UPDATE public.conversa_transferencias ct SET conversa_id = cm.canonico_conv_id
FROM _conv_map cm WHERE ct.conversa_id = cm.dup_conv_id;

-- fluxo_sessoes tem unique(conversa_id) — deletar das dups
DELETE FROM public.fluxo_sessoes WHERE conversa_id IN (SELECT dup_conv_id FROM _conv_map);

-- ============================================
-- PASSO 4: Deletar conversas duplicadas (de contatos a serem removidos)
-- ============================================
DELETE FROM public.conversas WHERE id IN (SELECT dup_conv_id FROM _conv_map);

-- ============================================
-- PASSO 5: Atualizar ultima_msg_at e ultimo_texto da conversa canônica
-- ============================================
UPDATE public.conversas c SET
  ultima_msg_at = sub.max_at,
  ultimo_texto = LEFT(sub.last_text, 200)
FROM (
  SELECT m.conversa_id, MAX(m.created_at) AS max_at,
    (SELECT conteudo FROM public.mensagens m2 WHERE m2.conversa_id = m.conversa_id ORDER BY m2.created_at DESC LIMIT 1) AS last_text
  FROM public.mensagens m
  WHERE m.conversa_id IN (SELECT DISTINCT canonico_conv_id FROM _conv_map)
  GROUP BY m.conversa_id
) sub
WHERE c.id = sub.conversa_id;

-- ============================================
-- PASSO 6: Repointar compras / giftback / campanhas
-- ============================================
UPDATE public.compras x SET contato_id = m.canonico_id FROM _contato_map m WHERE x.contato_id = m.dup_id;
UPDATE public.giftback_movimentos x SET contato_id = m.canonico_id FROM _contato_map m WHERE x.contato_id = m.dup_id;
UPDATE public.campanha_destinatarios x SET contato_id = m.canonico_id FROM _contato_map m WHERE x.contato_id = m.dup_id;

-- ============================================
-- PASSO 7: Deletar contatos duplicados
-- ============================================
DELETE FROM public.contatos WHERE id IN (SELECT dup_id FROM _contato_map);

-- ============================================
-- PASSO 8: Adicionar UNIQUE constraint para impedir duplicatas futuras
-- ============================================
ALTER TABLE public.contatos
  ADD CONSTRAINT contatos_tenant_telefone_unique
  UNIQUE (tenant_id, telefone);
