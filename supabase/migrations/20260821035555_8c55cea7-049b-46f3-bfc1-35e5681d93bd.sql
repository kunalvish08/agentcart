-- Role check no longer needs elevated rights: user_roles has a self-read policy.
DROP POLICY "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.owns_merchant(_merchant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.merchants m
    WHERE m.id = _merchant_id AND m.owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_product(_product_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.merchants m ON m.id = p.merchant_id
    WHERE p.id = _product_id AND m.owner_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_merchant(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_product(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_current_user(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_merchant(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_product(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bootstrap_current_user(TEXT, TEXT) TO authenticated, service_role;