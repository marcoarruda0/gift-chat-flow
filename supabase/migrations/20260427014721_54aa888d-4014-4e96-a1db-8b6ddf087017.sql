-- Função: marcar contato como cliente quando giftback de crédito é gerado
CREATE OR REPLACE FUNCTION public.marcar_contato_cliente_on_giftback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo = 'credito' AND NEW.contato_id IS NOT NULL THEN
    UPDATE public.contatos
    SET campos_personalizados =
      COALESCE(campos_personalizados, '{}'::jsonb)
      || jsonb_build_object('cliente', true),
      updated_at = now()
    WHERE id = NEW.contato_id
      AND tenant_id = NEW.tenant_id
      AND COALESCE((campos_personalizados->>'cliente')::boolean, false) = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marcar_cliente_on_giftback ON public.giftback_movimentos;

CREATE TRIGGER trg_marcar_cliente_on_giftback
AFTER INSERT ON public.giftback_movimentos
FOR EACH ROW
EXECUTE FUNCTION public.marcar_contato_cliente_on_giftback();

-- Backfill: marca como cliente todos os contatos que já receberam giftback de crédito
UPDATE public.contatos c
SET campos_personalizados =
  COALESCE(campos_personalizados, '{}'::jsonb)
  || jsonb_build_object('cliente', true),
  updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM public.giftback_movimentos gm
  WHERE gm.contato_id = c.id
    AND gm.tenant_id = c.tenant_id
    AND gm.tipo = 'credito'
)
AND COALESCE((campos_personalizados->>'cliente')::boolean, false) = false;

-- Garantir que o campo "cliente" exista no contato_campos_config para cada tenant
INSERT INTO public.contato_campos_config (tenant_id, nome, tipo, opcoes, obrigatorio, ordem, ativo)
SELECT DISTINCT t.id, 'cliente', 'booleano', '{}'::text[], false, 0, true
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.contato_campos_config ccc
  WHERE ccc.tenant_id = t.id
    AND lower(ccc.nome) = 'cliente'
);

-- Garantir que o campo "fornecedor" também exista (consistência com módulo CRM)
INSERT INTO public.contato_campos_config (tenant_id, nome, tipo, opcoes, obrigatorio, ordem, ativo)
SELECT DISTINCT t.id, 'fornecedor', 'booleano', '{}'::text[], false, 1, true
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.contato_campos_config ccc
  WHERE ccc.tenant_id = t.id
    AND lower(ccc.nome) = 'fornecedor'
);