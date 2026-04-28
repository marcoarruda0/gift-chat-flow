
REVOKE EXECUTE ON FUNCTION public.contato_timeline(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contato_timeline(uuid, int) TO authenticated;
