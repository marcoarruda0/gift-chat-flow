
-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin_master', 'admin_tenant', 'atendente', 'caixa');

-- Create enum for giftback movement type
CREATE TYPE public.giftback_tipo AS ENUM ('credito', 'debito', 'expiracao');

-- Create enum for giftback movement status
CREATE TYPE public.giftback_status AS ENUM ('ativo', 'usado', 'expirado');

-- ============================================
-- TENANTS
-- ============================================
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  plano TEXT DEFAULT 'free',
  status TEXT DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  nome TEXT,
  avatar_url TEXT,
  departamento TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USER ROLES
-- ============================================
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SECURITY DEFINER FUNCTIONS (avoid RLS recursion)
-- ============================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = _user_id
$$;

-- ============================================
-- CONTATOS
-- ============================================
CREATE TABLE public.contatos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  cpf TEXT,
  email TEXT,
  data_nascimento DATE,
  endereco TEXT,
  tags TEXT[] DEFAULT '{}',
  notas TEXT,
  saldo_giftback DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

-- ============================================
-- GIFTBACK CONFIG
-- ============================================
CREATE TABLE public.giftback_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  percentual DECIMAL(5,2) DEFAULT 10,
  validade_dias INTEGER DEFAULT 30,
  compra_minima DECIMAL(10,2) DEFAULT 0,
  credito_maximo DECIMAL(10,2) DEFAULT 9999,
  max_resgate_pct DECIMAL(5,2) DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.giftback_config ENABLE ROW LEVEL SECURITY;

-- ============================================
-- COMPRAS
-- ============================================
CREATE TABLE public.compras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contato_id UUID NOT NULL REFERENCES public.contatos(id) ON DELETE CASCADE,
  valor DECIMAL(10,2) NOT NULL,
  giftback_gerado DECIMAL(10,2) DEFAULT 0,
  giftback_usado DECIMAL(10,2) DEFAULT 0,
  operador_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;

-- ============================================
-- GIFTBACK MOVIMENTOS
-- ============================================
CREATE TABLE public.giftback_movimentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contato_id UUID NOT NULL REFERENCES public.contatos(id) ON DELETE CASCADE,
  compra_id UUID REFERENCES public.compras(id) ON DELETE SET NULL,
  tipo giftback_tipo NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  validade DATE,
  status giftback_status DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.giftback_movimentos ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Tenants
CREATE POLICY "admin_master_view_all_tenants" ON public.tenants
  FOR SELECT USING (public.has_role(auth.uid(), 'admin_master'));

CREATE POLICY "users_view_own_tenant" ON public.tenants
  FOR SELECT USING (id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "admin_master_manage_tenants" ON public.tenants
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

CREATE POLICY "admin_master_update_tenants" ON public.tenants
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin_master'));

CREATE POLICY "admin_master_delete_tenants" ON public.tenants
  FOR DELETE USING (public.has_role(auth.uid(), 'admin_master'));

-- Profiles
CREATE POLICY "users_view_own_profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "users_insert_own_profile" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "admin_master_view_all_profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin_master'));

CREATE POLICY "tenant_users_view_team" ON public.profiles
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- User roles
CREATE POLICY "users_view_own_roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "admin_master_manage_roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin_master'));

-- Contatos
CREATE POLICY "tenant_view_contacts" ON public.contatos
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_insert_contacts" ON public.contatos
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_update_contacts" ON public.contatos
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_delete_contacts" ON public.contatos
  FOR DELETE USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "admin_master_view_all_contacts" ON public.contatos
  FOR SELECT USING (public.has_role(auth.uid(), 'admin_master'));

-- Giftback config
CREATE POLICY "tenant_view_giftback_config" ON public.giftback_config
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_admin_insert_giftback_config" ON public.giftback_config
  FOR INSERT WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid()) 
    AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))
  );

CREATE POLICY "tenant_admin_update_giftback_config" ON public.giftback_config
  FOR UPDATE USING (
    tenant_id = public.get_user_tenant_id(auth.uid()) 
    AND (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master'))
  );

-- Compras
CREATE POLICY "tenant_view_purchases" ON public.compras
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_insert_purchases" ON public.compras
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Giftback movimentos
CREATE POLICY "tenant_view_giftback_mov" ON public.giftback_movimentos
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_insert_giftback_mov" ON public.giftback_movimentos
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_update_giftback_mov" ON public.giftback_movimentos
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX idx_contatos_tenant ON public.contatos(tenant_id);
CREATE INDEX idx_contatos_telefone ON public.contatos(telefone);
CREATE INDEX idx_contatos_cpf ON public.contatos(cpf);
CREATE INDEX idx_compras_tenant ON public.compras(tenant_id);
CREATE INDEX idx_compras_contato ON public.compras(contato_id);
CREATE INDEX idx_giftback_mov_tenant ON public.giftback_movimentos(tenant_id);
CREATE INDEX idx_giftback_mov_contato ON public.giftback_movimentos(contato_id);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_contatos_updated_at
  BEFORE UPDATE ON public.contatos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
