
-- Security definer function to check if target user is in same tenant
CREATE OR REPLACE FUNCTION public.is_same_tenant(_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _target_user_id
      AND tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  )
$$;

-- Allow admin_tenant to UPDATE roles of same-tenant users
CREATE POLICY "admin_tenant_update_roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.is_same_tenant(user_id)
  AND public.has_role(auth.uid(), 'admin_tenant'::app_role)
);

-- Allow admin_tenant to DELETE roles of same-tenant users
CREATE POLICY "admin_tenant_delete_roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.is_same_tenant(user_id)
  AND public.has_role(auth.uid(), 'admin_tenant'::app_role)
);

-- Allow admin_tenant to DELETE profiles of same-tenant users
CREATE POLICY "admin_tenant_delete_profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (
  public.is_same_tenant(id)
  AND public.has_role(auth.uid(), 'admin_tenant'::app_role)
);
