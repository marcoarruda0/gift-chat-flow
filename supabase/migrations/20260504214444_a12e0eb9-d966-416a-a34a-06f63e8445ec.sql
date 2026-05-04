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
    AND status <> 'vendido'
    AND (tenant_id = v_tenant OR public.has_role(auth.uid(), 'admin_master'));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;