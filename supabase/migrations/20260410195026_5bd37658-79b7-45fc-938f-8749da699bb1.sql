
-- Enums
CREATE TYPE public.remetente_tipo AS ENUM ('contato', 'atendente', 'bot');
CREATE TYPE public.mensagem_tipo AS ENUM ('texto', 'imagem', 'audio', 'video', 'documento');

-- Conversas table
CREATE TABLE public.conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contato_id uuid NOT NULL REFERENCES public.contatos(id) ON DELETE CASCADE,
  atendente_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ultimo_texto text,
  ultima_msg_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'aberta',
  nao_lidas integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_conversas" ON public.conversas FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_insert_conversas" ON public.conversas FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_update_conversas" ON public.conversas FOR UPDATE USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_delete_conversas" ON public.conversas FOR DELETE USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE INDEX idx_conversas_tenant ON public.conversas(tenant_id);
CREATE INDEX idx_conversas_contato ON public.conversas(contato_id);
CREATE INDEX idx_conversas_ultima_msg ON public.conversas(ultima_msg_at DESC);

-- Mensagens table
CREATE TABLE public.mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversa_id uuid NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  remetente remetente_tipo NOT NULL DEFAULT 'atendente',
  tipo mensagem_tipo NOT NULL DEFAULT 'texto',
  conteudo text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_mensagens" ON public.mensagens FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_insert_mensagens" ON public.mensagens FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_update_mensagens" ON public.mensagens FOR UPDATE USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_delete_mensagens" ON public.mensagens FOR DELETE USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE INDEX idx_mensagens_conversa ON public.mensagens(conversa_id);
CREATE INDEX idx_mensagens_created ON public.mensagens(created_at);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversas;
