CREATE UNIQUE INDEX IF NOT EXISTS contatos_tenant_cpf_unique
  ON public.contatos (tenant_id, cpf)
  WHERE cpf IS NOT NULL;