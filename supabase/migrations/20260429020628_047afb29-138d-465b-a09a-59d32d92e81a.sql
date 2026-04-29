-- Tabela de fixações de conversas por usuário
CREATE TABLE public.conversa_fixacoes (
  conversa_id uuid NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  fixada_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversa_id, user_id)
);

CREATE INDEX idx_conversa_fixacoes_user ON public.conversa_fixacoes(user_id, tenant_id);

ALTER TABLE public.conversa_fixacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê suas próprias fixações"
ON public.conversa_fixacoes
FOR SELECT
TO authenticated
USING (user_id = auth.uid() AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Usuário cria suas próprias fixações"
ON public.conversa_fixacoes
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Usuário remove suas próprias fixações"
ON public.conversa_fixacoes
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Função/trigger: remove fixações ao encerrar ou transferir conversa
CREATE OR REPLACE FUNCTION public.limpar_fixacoes_conversa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Se a conversa foi fechada: remove todas as fixações
  IF NEW.status = 'fechada' AND COALESCE(OLD.status, '') <> 'fechada' THEN
    DELETE FROM public.conversa_fixacoes WHERE conversa_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Se o atendente mudou: remove a fixação do atendente anterior
  IF NEW.atendente_id IS DISTINCT FROM OLD.atendente_id THEN
    IF OLD.atendente_id IS NOT NULL THEN
      DELETE FROM public.conversa_fixacoes
      WHERE conversa_id = NEW.id AND user_id = OLD.atendente_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_limpar_fixacoes_conversa
AFTER UPDATE ON public.conversas
FOR EACH ROW
EXECUTE FUNCTION public.limpar_fixacoes_conversa();