-- Allow users to view tenants they're linked to via user_tenants
CREATE POLICY "users_view_linked_tenants"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_tenants ut
    WHERE ut.tenant_id = tenants.id
      AND ut.user_id = auth.uid()
  )
);

-- Remove duplicate tenant "PR TATUAPE" (the most recent one)
DELETE FROM public.user_tenants WHERE tenant_id = '15925329-5c75-4bca-8275-ff1edb607eec';
DELETE FROM public.tenants WHERE id = '15925329-5c75-4bca-8275-ff1edb607eec';