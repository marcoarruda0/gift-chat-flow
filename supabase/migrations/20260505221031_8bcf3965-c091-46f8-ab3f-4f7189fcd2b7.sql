-- Tabela de auditoria de vendas/débitos vindos do BlinkChat
CREATE TABLE public.saldos_vendas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  cpf_cnpj TEXT NOT NULL,
  nome TEXT,
  valor_total NUMERIC NOT NULL,
  debito_moeda_pr NUMERIC NOT NULL DEFAULT 0,
  debito_consignado NUMERIC NOT NULL DEFAULT 0,
  saldo_restante NUMERIC,
  origem TEXT NOT NULL DEFAULT 'blinkchat',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_saldos_vendas_tenant_cpf_data
  ON public.saldos_vendas (tenant_id, cpf_cnpj, created_at DESC);

ALTER TABLE public.saldos_vendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_saldos_vendas"
  ON public.saldos_vendas FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.has_role(auth.uid(), 'admin_master'));

-- Função atômica de débito (Moeda PR primeiro, depois Consignado)
CREATE OR REPLACE FUNCTION public.debitar_saldo_blinkchat(
  p_tenant_id UUID,
  p_cpf TEXT,
  p_valor NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cpf TEXT;
  v_saldo_moeda NUMERIC := 0;
  v_saldo_consig NUMERIC := 0;
  v_total NUMERIC := 0;
  v_debito_moeda NUMERIC := 0;
  v_debito_consig NUMERIC := 0;
  v_nome TEXT;
  v_dup_id UUID;
  v_restante NUMERIC;
  r RECORD;
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'VALOR_INVALIDO';
  END IF;

  v_cpf := regexp_replace(COALESCE(p_cpf,''), '\D', '', 'g');
  IF length(v_cpf) = 0 THEN
    RAISE EXCEPTION 'CPF_INVALIDO';
  END IF;

  -- Anti-duplicata (30s)
  SELECT id INTO v_dup_id
  FROM public.saldos_vendas
  WHERE tenant_id = p_tenant_id
    AND cpf_cnpj = v_cpf
    AND valor_total = p_valor
    AND created_at > now() - interval '30 seconds'
  LIMIT 1;

  IF v_dup_id IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICADO';
  END IF;

  -- Trava linhas e calcula saldos
  SELECT COALESCE(SUM(saldo), 0) INTO v_saldo_moeda
  FROM public.saldos_moeda_pr
  WHERE tenant_id = p_tenant_id AND cpf_cnpj = v_cpf
  FOR UPDATE;

  SELECT COALESCE(SUM(saldo_total), 0) INTO v_saldo_consig
  FROM public.saldos_consignado
  WHERE tenant_id = p_tenant_id AND cpf_cnpj = v_cpf
  FOR UPDATE;

  v_total := v_saldo_moeda + v_saldo_consig;

  IF v_total < p_valor THEN
    RAISE EXCEPTION 'SALDO_INSUFICIENTE saldo=% valor=%', v_total, p_valor;
  END IF;

  -- Nome (preferência: moeda_pr; fallback: consignado)
  SELECT nome INTO v_nome
  FROM public.saldos_moeda_pr
  WHERE tenant_id = p_tenant_id AND cpf_cnpj = v_cpf AND nome IS NOT NULL
  LIMIT 1;

  IF v_nome IS NULL THEN
    SELECT nome INTO v_nome
    FROM public.saldos_consignado
    WHERE tenant_id = p_tenant_id AND cpf_cnpj = v_cpf AND nome IS NOT NULL
    LIMIT 1;
  END IF;

  -- Prioridade: Moeda PR primeiro
  v_debito_moeda := LEAST(v_saldo_moeda, p_valor);
  v_debito_consig := p_valor - v_debito_moeda;

  -- Debita Moeda PR distribuindo entre as linhas (maior saldo primeiro)
  v_restante := v_debito_moeda;
  IF v_restante > 0 THEN
    FOR r IN
      SELECT id, saldo
      FROM public.saldos_moeda_pr
      WHERE tenant_id = p_tenant_id AND cpf_cnpj = v_cpf AND saldo > 0
      ORDER BY saldo DESC
    LOOP
      EXIT WHEN v_restante <= 0;
      IF r.saldo >= v_restante THEN
        UPDATE public.saldos_moeda_pr SET saldo = saldo - v_restante WHERE id = r.id;
        v_restante := 0;
      ELSE
        UPDATE public.saldos_moeda_pr SET saldo = 0 WHERE id = r.id;
        v_restante := v_restante - r.saldo;
      END IF;
    END LOOP;
  END IF;

  -- Debita Consignado distribuindo entre as linhas (maior saldo primeiro)
  v_restante := v_debito_consig;
  IF v_restante > 0 THEN
    FOR r IN
      SELECT id, saldo_total AS saldo
      FROM public.saldos_consignado
      WHERE tenant_id = p_tenant_id AND cpf_cnpj = v_cpf AND saldo_total > 0
      ORDER BY saldo_total DESC
    LOOP
      EXIT WHEN v_restante <= 0;
      IF r.saldo >= v_restante THEN
        UPDATE public.saldos_consignado SET saldo_total = saldo_total - v_restante WHERE id = r.id;
        v_restante := 0;
      ELSE
        UPDATE public.saldos_consignado SET saldo_total = 0 WHERE id = r.id;
        v_restante := v_restante - r.saldo;
      END IF;
    END LOOP;
  END IF;

  -- Registra a venda
  INSERT INTO public.saldos_vendas (
    tenant_id, cpf_cnpj, nome, valor_total,
    debito_moeda_pr, debito_consignado, saldo_restante, origem
  ) VALUES (
    p_tenant_id, v_cpf, v_nome, p_valor,
    v_debito_moeda, v_debito_consig, v_total - p_valor, 'blinkchat'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'cpf', v_cpf,
    'nome', v_nome,
    'valor_debitado', p_valor,
    'debito_moeda_pr', v_debito_moeda,
    'debito_consignado', v_debito_consig,
    'saldo_restante', v_total - p_valor
  );
END;
$$;