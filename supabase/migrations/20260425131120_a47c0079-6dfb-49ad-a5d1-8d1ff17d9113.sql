-- Backfill: consolidar para 1 ativo por contato (manter o mais recente)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, contato_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.giftback_movimentos
  WHERE tipo = 'credito' AND status = 'ativo'
)
UPDATE public.giftback_movimentos m
SET status = 'inativo'::public.giftback_status,
    motivo_inativacao = 'substituido'
FROM ranked r
WHERE m.id = r.id
  AND r.rn > 1;

-- Recalcular saldo do contato com o único ativo restante
UPDATE public.contatos c
SET saldo_giftback = COALESCE(sub.valor_ativo, 0)
FROM (
  SELECT contato_id, MAX(valor) AS valor_ativo
  FROM public.giftback_movimentos
  WHERE tipo = 'credito' AND status = 'ativo'
  GROUP BY contato_id
) sub
WHERE c.id = sub.contato_id;

-- Zerar saldo de quem não tem ativo
UPDATE public.contatos c
SET saldo_giftback = 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.giftback_movimentos m
  WHERE m.contato_id = c.id
    AND m.tipo = 'credito'
    AND m.status = 'ativo'
)
AND COALESCE(c.saldo_giftback, 0) <> 0;

-- Índice único parcial
CREATE UNIQUE INDEX IF NOT EXISTS uniq_giftback_ativo_por_contato
  ON public.giftback_movimentos (tenant_id, contato_id)
  WHERE tipo = 'credito' AND status = 'ativo';