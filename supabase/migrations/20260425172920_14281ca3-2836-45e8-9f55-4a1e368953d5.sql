-- Filtro RFM nas regras
ALTER TABLE public.giftback_comunicacao_regras
  ADD COLUMN IF NOT EXISTS filtro_rfv_segmentos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS filtro_rfv_modo text NOT NULL DEFAULT 'todos';

ALTER TABLE public.giftback_comunicacao_regras
  DROP CONSTRAINT IF EXISTS giftback_comunicacao_regras_filtro_rfv_modo_check;

ALTER TABLE public.giftback_comunicacao_regras
  ADD CONSTRAINT giftback_comunicacao_regras_filtro_rfv_modo_check
  CHECK (filtro_rfv_modo IN ('todos', 'incluir'));

-- Flag de teste no log
ALTER TABLE public.giftback_comunicacao_log
  ADD COLUMN IF NOT EXISTS is_teste boolean NOT NULL DEFAULT false;

-- FKs para exportação enriquecida (preserva histórico em ON DELETE SET NULL)
ALTER TABLE public.giftback_comunicacao_log
  ALTER COLUMN regra_id DROP NOT NULL,
  ALTER COLUMN contato_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'giftback_comunicacao_log_regra_id_fkey'
  ) THEN
    ALTER TABLE public.giftback_comunicacao_log
      ADD CONSTRAINT giftback_comunicacao_log_regra_id_fkey
      FOREIGN KEY (regra_id) REFERENCES public.giftback_comunicacao_regras(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'giftback_comunicacao_log_contato_id_fkey'
  ) THEN
    ALTER TABLE public.giftback_comunicacao_log
      ADD CONSTRAINT giftback_comunicacao_log_contato_id_fkey
      FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Permitir INSERT no log via tenant_admin (usado pela função de teste autenticada)
DROP POLICY IF EXISTS tenant_admin_insert_gb_com_log ON public.giftback_comunicacao_log;
CREATE POLICY tenant_admin_insert_gb_com_log
  ON public.giftback_comunicacao_log
  FOR INSERT
  TO public
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin_tenant'::app_role) OR public.has_role(auth.uid(), 'admin_master'::app_role))
  );

-- Índice para acelerar filtros por período
CREATE INDEX IF NOT EXISTS idx_gb_com_log_tenant_data
  ON public.giftback_comunicacao_log(tenant_id, enviado_em DESC);
