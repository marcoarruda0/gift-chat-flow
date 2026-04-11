
-- Add cnpj and telefone_empresa to tenants
ALTER TABLE public.tenants ADD COLUMN cnpj text;
ALTER TABLE public.tenants ADD COLUMN telefone_empresa text;

-- Allow tenant admins to update their own tenant
CREATE POLICY "tenant_admin_update_own_tenant"
ON public.tenants FOR UPDATE
USING (
  id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
);

-- Create convites table
CREATE TABLE public.convites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'atendente',
  convidado_por uuid NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.convites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_admin_view_convites" ON public.convites
FOR SELECT USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
);

CREATE POLICY "tenant_admin_insert_convites" ON public.convites
FOR INSERT WITH CHECK (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
);

CREATE POLICY "tenant_admin_delete_convites" ON public.convites
FOR DELETE USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin_tenant') OR has_role(auth.uid(), 'admin_master'))
);

-- Update handle_new_user to check for pending invites
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id uuid;
  tenant_name text;
  invite_record record;
BEGIN
  -- Check for pending invite
  SELECT * INTO invite_record
  FROM public.convites
  WHERE email = NEW.email
    AND status = 'pendente'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF invite_record IS NOT NULL THEN
    -- Join existing tenant from invite
    new_tenant_id := invite_record.tenant_id;

    INSERT INTO public.profiles (id, nome, tenant_id)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
      new_tenant_id
    );

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, invite_record.role);

    -- Mark invite as accepted
    UPDATE public.convites
    SET status = 'aceito'
    WHERE id = invite_record.id;
  ELSE
    -- Original behavior: create new tenant
    tenant_name := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'empresa'), ''),
      SPLIT_PART(NEW.email, '@', 1)
    );

    INSERT INTO public.tenants (nome)
    VALUES (tenant_name)
    RETURNING id INTO new_tenant_id;

    INSERT INTO public.profiles (id, nome, tenant_id)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
      new_tenant_id
    );

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin_tenant');
  END IF;

  RETURN NEW;
END;
$$;
