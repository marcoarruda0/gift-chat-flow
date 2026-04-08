
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id uuid;
  tenant_name text;
BEGIN
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

  RETURN NEW;
END;
$$;
