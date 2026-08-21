REVOKE EXECUTE ON FUNCTION public.owns_agent_session(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.owns_agent_session(uuid) TO authenticated, service_role;