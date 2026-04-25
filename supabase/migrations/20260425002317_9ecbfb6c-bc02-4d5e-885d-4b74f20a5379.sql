-- Drop old unique constraint/index that prevented multiple conversations per contact
DROP INDEX IF EXISTS public.conversas_tenant_contato_unique;
ALTER TABLE public.conversas DROP CONSTRAINT IF EXISTS conversas_tenant_contato_unique;

-- New unique partial index: one open conversation per (tenant, contato, canal)
CREATE UNIQUE INDEX IF NOT EXISTS conversas_tenant_contato_canal_unique
  ON public.conversas (tenant_id, contato_id, canal)
  WHERE status <> 'encerrada';