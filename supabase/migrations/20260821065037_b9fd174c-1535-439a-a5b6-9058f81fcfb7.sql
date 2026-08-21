REVOKE ALL ON FUNCTION public.can_view_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_order(uuid) TO authenticated, service_role;