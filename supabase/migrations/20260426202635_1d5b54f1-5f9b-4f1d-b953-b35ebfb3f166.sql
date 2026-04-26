-- Tabela de grupos de campanhas
CREATE TABLE public.campanha_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  cor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Nome único por tenant (case-insensitive)
CREATE UNIQUE INDEX idx_campanha_grupos_tenant_nome
  ON public.campanha_grupos (tenant_id, lower(nome));

-- RLS
ALTER TABLE public.campanha_grupos ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_view_campanha_grupos
  ON public.campanha_grupos FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY tenant_admin_insert_campanha_grupos
  ON public.campanha_grupos FOR INSERT
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY tenant_admin_update_campanha_grupos
  ON public.campanha_grupos FOR UPDATE
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY tenant_admin_delete_campanha_grupos
  ON public.campanha_grupos FOR DELETE
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))
  );

-- Trigger updated_at
CREATE TRIGGER trg_campanha_grupos_updated_at
  BEFORE UPDATE ON public.campanha_grupos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Coluna em campanhas + index
ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS grupo_id uuid;

CREATE INDEX IF NOT EXISTS idx_campanhas_grupo
  ON public.campanhas (tenant_id, grupo_id);