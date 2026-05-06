CREATE OR REPLACE FUNCTION public.listar_membros_tenant()
RETURNS TABLE (
  id uuid,
  nome text,
  email text,
  avatar_url text,
  departamento_id uuid,
  role app_role,
  last_sign_in_at timestamptz,
  user_created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := public.get_user_tenant_id(auth.uid());
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  IF NOT (public.has_role(auth.uid(), 'admin_tenant') OR public.has_role(auth.uid(), 'admin_master')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    u.email::text,
    p.avatar_url,
    p.departamento_id,
    (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = p.id LIMIT 1) AS role,
    u.last_sign_in_at,
    u.created_at AS user_created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.tenant_id = v_tenant
  ORDER BY p.nome NULLS LAST;
END;
$$;