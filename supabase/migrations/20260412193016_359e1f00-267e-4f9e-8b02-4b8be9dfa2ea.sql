
-- Table to track last assigned agent per department
CREATE TABLE public.departamento_distribuicao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  departamento_id uuid NOT NULL REFERENCES public.departamentos(id) ON DELETE CASCADE,
  ultimo_atendente_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, departamento_id)
);

ALTER TABLE public.departamento_distribuicao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_view_distribuicao" ON public.departamento_distribuicao
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_insert_distribuicao" ON public.departamento_distribuicao
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant_update_distribuicao" ON public.departamento_distribuicao
  FOR UPDATE USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Round-robin function
CREATE OR REPLACE FUNCTION public.distribuir_atendente(p_tenant_id uuid, p_departamento_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_members uuid[];
  v_last_id uuid;
  v_next_id uuid;
  v_idx int;
BEGIN
  -- Get all members of the department ordered by id
  SELECT array_agg(p.id ORDER BY p.id)
  INTO v_members
  FROM public.profiles p
  WHERE p.tenant_id = p_tenant_id
    AND p.departamento_id = p_departamento_id;

  -- No members in department
  IF v_members IS NULL OR array_length(v_members, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  -- Only one member
  IF array_length(v_members, 1) = 1 THEN
    v_next_id := v_members[1];
  ELSE
    -- Get last assigned agent
    SELECT ultimo_atendente_id INTO v_last_id
    FROM public.departamento_distribuicao
    WHERE tenant_id = p_tenant_id AND departamento_id = p_departamento_id;

    IF v_last_id IS NULL THEN
      v_next_id := v_members[1];
    ELSE
      -- Find index of last assigned
      v_idx := NULL;
      FOR i IN 1..array_length(v_members, 1) LOOP
        IF v_members[i] = v_last_id THEN
          v_idx := i;
          EXIT;
        END IF;
      END LOOP;

      IF v_idx IS NULL OR v_idx >= array_length(v_members, 1) THEN
        v_next_id := v_members[1];
      ELSE
        v_next_id := v_members[v_idx + 1];
      END IF;
    END IF;
  END IF;

  -- Upsert the tracking record
  INSERT INTO public.departamento_distribuicao (tenant_id, departamento_id, ultimo_atendente_id, updated_at)
  VALUES (p_tenant_id, p_departamento_id, v_next_id, now())
  ON CONFLICT (tenant_id, departamento_id)
  DO UPDATE SET ultimo_atendente_id = v_next_id, updated_at = now();

  RETURN v_next_id;
END;
$$;
