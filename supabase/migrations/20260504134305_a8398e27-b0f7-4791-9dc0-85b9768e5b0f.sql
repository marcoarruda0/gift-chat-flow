-- 1. Coluna total_slots
ALTER TABLE public.vendas_online_config
  ADD COLUMN IF NOT EXISTS total_slots integer NOT NULL DEFAULT 99 CHECK (total_slots BETWEEN 1 AND 999);

-- 2. Unique (tenant_id, numero) — necessário para ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chamado_denis_itens_tenant_numero_key'
  ) THEN
    ALTER TABLE public.chamado_denis_itens
      ADD CONSTRAINT chamado_denis_itens_tenant_numero_key UNIQUE (tenant_id, numero);
  END IF;
END $$;

-- 3. Função para criar slots faltantes
CREATE OR REPLACE FUNCTION public.seed_chamado_denis_slots(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total integer;
  v_inserted integer := 0;
BEGIN
  SELECT total_slots INTO v_total FROM public.vendas_online_config WHERE tenant_id = p_tenant_id;
  IF v_total IS NULL THEN
    v_total := 99;
  END IF;

  INSERT INTO public.chamado_denis_itens (tenant_id, numero, descricao, valor, status)
  SELECT p_tenant_id, gs, '', 0, 'disponivel'
  FROM generate_series(1, v_total) AS gs
  ON CONFLICT (tenant_id, numero) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- 4. Função para resetar slots (uma ou várias)
CREATE OR REPLACE FUNCTION public.reset_chamado_denis_slots(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_count integer;
BEGIN
  v_tenant := public.get_user_tenant_id(auth.uid());
  IF v_tenant IS NULL AND NOT public.has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'no_tenant';
  END IF;

  UPDATE public.chamado_denis_itens
  SET descricao = '',
      valor = 0,
      status = 'disponivel',
      local_id = NULL,
      forma_pagamento = NULL,
      pagador_nome = NULL,
      pagador_email = NULL,
      pagador_cel = NULL,
      pagador_tax_id = NULL,
      pago_em = NULL,
      abacate_billing_id = NULL,
      abacate_status = NULL,
      abacate_url = NULL,
      abacate_product_id = NULL,
      abacate_product_external_id = NULL,
      entregue = false,
      entregue_em = NULL,
      entregue_por = NULL,
      entregue_para_proprio = NULL,
      entregue_para_nome = NULL,
      entregue_para_doc = NULL,
      entregue_assinatura = NULL,
      updated_at = now()
  WHERE id = ANY(p_ids)
    AND (tenant_id = v_tenant OR public.has_role(auth.uid(), 'admin_master'));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 5. Trigger que cria slots ao criar config
CREATE OR REPLACE FUNCTION public.tg_seed_slots_on_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.seed_chamado_denis_slots(NEW.tenant_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_slots_on_config ON public.vendas_online_config;
CREATE TRIGGER trg_seed_slots_on_config
AFTER INSERT OR UPDATE OF total_slots ON public.vendas_online_config
FOR EACH ROW EXECUTE FUNCTION public.tg_seed_slots_on_config();

-- 6. Trigger que bloqueia inserts além do total
CREATE OR REPLACE FUNCTION public.tg_check_slot_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total integer;
  v_max integer;
BEGIN
  SELECT total_slots INTO v_total FROM public.vendas_online_config WHERE tenant_id = NEW.tenant_id;
  IF v_total IS NULL THEN
    v_total := 99;
  END IF;

  SELECT COALESCE(MAX(numero), 0) INTO v_max FROM public.chamado_denis_itens WHERE tenant_id = NEW.tenant_id;

  IF NEW.numero IS NULL OR NEW.numero = 0 THEN
    NEW.numero := v_max + 1;
  END IF;

  IF NEW.numero > v_total THEN
    RAISE EXCEPTION 'Limite de % slots atingido para este tenant. Aumente em Configurações de Vendas Online.', v_total;
  END IF;

  RETURN NEW;
END;
$$;

-- Substitui o set_chamado_denis_numero antigo
DROP TRIGGER IF EXISTS trg_set_chamado_denis_numero ON public.chamado_denis_itens;
DROP TRIGGER IF EXISTS trg_check_slot_limit ON public.chamado_denis_itens;
CREATE TRIGGER trg_check_slot_limit
BEFORE INSERT ON public.chamado_denis_itens
FOR EACH ROW EXECUTE FUNCTION public.tg_check_slot_limit();

-- 7. Backfill: para todo tenant com config, criar slots faltantes
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT tenant_id FROM public.vendas_online_config LOOP
    PERFORM public.seed_chamado_denis_slots(r.tenant_id);
  END LOOP;
  -- Tenants que têm itens mas não têm config: criar config padrão
  FOR r IN
    SELECT DISTINCT i.tenant_id
    FROM public.chamado_denis_itens i
    LEFT JOIN public.vendas_online_config c ON c.tenant_id = i.tenant_id
    WHERE c.tenant_id IS NULL
  LOOP
    INSERT INTO public.vendas_online_config (tenant_id) VALUES (r.tenant_id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;