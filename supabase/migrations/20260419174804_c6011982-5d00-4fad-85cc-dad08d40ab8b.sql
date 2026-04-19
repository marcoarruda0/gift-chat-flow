-- Allow admin_tenant (and admin_master) to create new tenants
DROP POLICY IF EXISTS admin_master_manage_tenants ON public.tenants;

CREATE POLICY "admins_can_create_tenants"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin_master'::app_role)
  OR has_role(auth.uid(), 'admin_tenant'::app_role)
);