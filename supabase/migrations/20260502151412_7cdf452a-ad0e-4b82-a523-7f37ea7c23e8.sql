-- Tabela para o módulo "Chamado Vendas Online" (interno: chamado_denis)
CREATE TABLE public.chamado_denis_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  numero INTEGER NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'disponivel',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chamado_denis_itens_status_check CHECK (status IN ('disponivel','vendido')),
  CONSTRAINT chamado_denis_itens_tenant_numero_key UNIQUE (tenant_id, numero)
);

CREATE INDEX idx_chamado_denis_itens_tenant ON public.chamado_denis_itens(tenant_id, numero DESC);

-- Trigger: numerar sequencialmente por tenant
CREATE OR REPLACE FUNCTION public.set_chamado_denis_numero()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = 0 THEN
    SELECT COALESCE(MAX(numero), 0) + 1
      INTO NEW.numero
      FROM public.chamado_denis_itens
     WHERE tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_chamado_denis_set_numero
BEFORE INSERT ON public.chamado_denis_itens
FOR EACH ROW EXECUTE FUNCTION public.set_chamado_denis_numero();

-- Trigger: updated_at
CREATE TRIGGER trg_chamado_denis_updated_at
BEFORE UPDATE ON public.chamado_denis_itens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.chamado_denis_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_view_chamado_denis
ON public.chamado_denis_itens
FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()) OR has_role(auth.uid(), 'admin_master'::app_role));

CREATE POLICY tenant_insert_chamado_denis
ON public.chamado_denis_itens
FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) OR has_role(auth.uid(), 'admin_master'::app_role));

CREATE POLICY tenant_update_chamado_denis
ON public.chamado_denis_itens
FOR UPDATE
USING (tenant_id = get_user_tenant_id(auth.uid()) OR has_role(auth.uid(), 'admin_master'::app_role));

CREATE POLICY tenant_delete_chamado_denis
ON public.chamado_denis_itens
FOR DELETE
USING (tenant_id = get_user_tenant_id(auth.uid()) OR has_role(auth.uid(), 'admin_master'::app_role));