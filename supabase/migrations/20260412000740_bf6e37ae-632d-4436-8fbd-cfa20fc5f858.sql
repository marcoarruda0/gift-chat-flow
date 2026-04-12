
-- Add 'sistema' to remetente_tipo enum
ALTER TYPE public.remetente_tipo ADD VALUE IF NOT EXISTS 'sistema';

-- Create conversa_transferencias table
CREATE TABLE public.conversa_transferencias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversa_id uuid NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  de_user_id uuid NOT NULL,
  para_user_id uuid NOT NULL,
  motivo text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.conversa_transferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_transferencias"
  ON public.conversa_transferencias FOR SELECT
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_insert_transferencias"
  ON public.conversa_transferencias FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

CREATE INDEX idx_transferencias_conversa ON public.conversa_transferencias(conversa_id);
