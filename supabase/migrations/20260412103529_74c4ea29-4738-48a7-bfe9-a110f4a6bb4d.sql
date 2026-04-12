
ALTER TABLE public.profiles
ADD COLUMN apelido text,
ADD COLUMN mostrar_apelido boolean NOT NULL DEFAULT false;

-- Allow tenant admins to update team member profiles
CREATE POLICY "admin_tenant_update_team_profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (is_same_tenant(id) AND has_role(auth.uid(), 'admin_tenant'::app_role));
