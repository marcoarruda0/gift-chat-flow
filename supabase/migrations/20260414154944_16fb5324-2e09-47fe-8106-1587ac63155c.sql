
-- Create user_tenants junction table
CREATE TABLE public.user_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

-- Populate with existing data
INSERT INTO public.user_tenants (user_id, tenant_id)
SELECT id, tenant_id FROM public.profiles WHERE tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;

-- Users can view their own tenant memberships
CREATE POLICY "users_view_own_tenants" ON public.user_tenants
FOR SELECT USING (user_id = auth.uid());

-- Admin master can do everything; regular users can only view their own
CREATE POLICY "admin_master_manage_user_tenants" ON public.user_tenants
FOR ALL USING (has_role(auth.uid(), 'admin_master'));

-- Admin tenant can insert (for inviting members to their tenant)
CREATE POLICY "admin_tenant_insert_user_tenants" ON public.user_tenants
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin_tenant') AND
  tenant_id = get_user_tenant_id(auth.uid())
);

-- Update handle_new_user to also insert into user_tenants
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    new_tenant_id := invite_record.tenant_id;

    INSERT INTO public.profiles (id, nome, tenant_id)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
      new_tenant_id
    );

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, invite_record.role);

    -- Add to user_tenants
    INSERT INTO public.user_tenants (user_id, tenant_id)
    VALUES (NEW.id, new_tenant_id)
    ON CONFLICT DO NOTHING;

    UPDATE public.convites
    SET status = 'aceito'
    WHERE id = invite_record.id;
  ELSE
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

    -- Add to user_tenants
    INSERT INTO public.user_tenants (user_id, tenant_id)
    VALUES (NEW.id, new_tenant_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
