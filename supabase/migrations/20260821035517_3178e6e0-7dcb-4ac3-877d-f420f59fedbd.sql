-- Enums
CREATE TYPE public.app_role AS ENUM ('merchant', 'admin', 'demo_buyer');
CREATE TYPE public.entity_status AS ENUM ('active', 'inactive');
CREATE TYPE public.relation_type AS ENUM ('upsell', 'cross_sell', 'alternative');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX user_roles_user_id_idx ON public.user_roles (user_id);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- role helper (SECURITY DEFINER to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- merchants
CREATE TABLE public.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX merchants_owner_id_idx ON public.merchants (owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchants TO authenticated;
GRANT ALL ON public.merchants TO service_role;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owns_merchant(_merchant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.merchants m
    WHERE m.id = _merchant_id AND m.owner_id = auth.uid()
  );
$$;

-- products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  status public.entity_status NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_merchant_id_idx ON public.products (merchant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- merchant_policies
CREATE TABLE public.merchant_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL UNIQUE REFERENCES public.merchants(id) ON DELETE CASCADE,
  max_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (max_discount_percent >= 0 AND max_discount_percent <= 100),
  max_order_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (max_order_value >= 0),
  approval_required_above NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (approval_required_above >= 0),
  allow_negotiation BOOLEAN NOT NULL DEFAULT false,
  allow_upsell BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX merchant_policies_merchant_id_idx ON public.merchant_policies (merchant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_policies TO authenticated;
GRANT ALL ON public.merchant_policies TO service_role;
ALTER TABLE public.merchant_policies ENABLE ROW LEVEL SECURITY;

-- product_relations
CREATE TABLE public.product_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  related_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  relation_type public.relation_type NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (product_id <> related_product_id),
  UNIQUE (product_id, related_product_id, relation_type)
);
CREATE INDEX product_relations_product_id_idx ON public.product_relations (product_id);
CREATE INDEX product_relations_related_product_id_idx ON public.product_relations (related_product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_relations TO authenticated;
GRANT ALL ON public.product_relations TO service_role;
ALTER TABLE public.product_relations ENABLE ROW LEVEL SECURITY;

-- helper: does the caller own the merchant that owns this product
CREATE OR REPLACE FUNCTION public.owns_product(_product_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.merchants m ON m.id = p.merchant_id
    WHERE p.id = _product_id AND m.owner_id = auth.uid()
  );
$$;

-- updated_at triggers
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER merchants_set_updated_at BEFORE UPDATE ON public.merchants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER merchant_policies_set_updated_at BEFORE UPDATE ON public.merchant_policies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS policies: profiles
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- RLS policies: user_roles (read only from client)
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- RLS policies: merchants
CREATE POLICY "merchants_select" ON public.merchants FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "merchants_insert" ON public.merchants FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "merchants_update" ON public.merchants FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "merchants_delete" ON public.merchants FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- RLS policies: products
CREATE POLICY "products_select" ON public.products FOR SELECT TO authenticated
  USING (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "products_insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "products_update" ON public.products FOR UPDATE TO authenticated
  USING (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "products_delete" ON public.products FOR DELETE TO authenticated
  USING (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));

-- RLS policies: merchant_policies
CREATE POLICY "merchant_policies_select" ON public.merchant_policies FOR SELECT TO authenticated
  USING (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "merchant_policies_insert" ON public.merchant_policies FOR INSERT TO authenticated
  WITH CHECK (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "merchant_policies_update" ON public.merchant_policies FOR UPDATE TO authenticated
  USING (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "merchant_policies_delete" ON public.merchant_policies FOR DELETE TO authenticated
  USING (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));

-- RLS policies: product_relations (both sides must belong to an owned merchant)
CREATE POLICY "product_relations_select" ON public.product_relations FOR SELECT TO authenticated
  USING ((public.owns_product(product_id) AND public.owns_product(related_product_id)) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "product_relations_insert" ON public.product_relations FOR INSERT TO authenticated
  WITH CHECK ((public.owns_product(product_id) AND public.owns_product(related_product_id)) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "product_relations_update" ON public.product_relations FOR UPDATE TO authenticated
  USING ((public.owns_product(product_id) AND public.owns_product(related_product_id)) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK ((public.owns_product(product_id) AND public.owns_product(related_product_id)) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "product_relations_delete" ON public.product_relations FOR DELETE TO authenticated
  USING ((public.owns_product(product_id) AND public.owns_product(related_product_id)) OR public.has_role(auth.uid(), 'admin'));

-- Bootstrap: give a signed-in user a profile, merchant role, merchant and default policy
CREATE OR REPLACE FUNCTION public.bootstrap_current_user(_full_name TEXT DEFAULT NULL, _store_name TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _email TEXT;
  _merchant_id UUID;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT u.email INTO _email FROM auth.users u WHERE u.id = _uid;

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (_uid, COALESCE(_full_name, split_part(_email, '@', 1)), _email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'merchant')
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT m.id INTO _merchant_id FROM public.merchants m
  WHERE m.owner_id = _uid ORDER BY m.created_at LIMIT 1;

  IF _merchant_id IS NULL THEN
    INSERT INTO public.merchants (owner_id, name, description)
    VALUES (_uid, COALESCE(_store_name, COALESCE(_full_name, split_part(_email, '@', 1)) || '''s Store'), 'Merchant store on the Agentic Commerce platform.')
    RETURNING id INTO _merchant_id;
  END IF;

  INSERT INTO public.merchant_policies (merchant_id, max_discount_percent, max_order_value, approval_required_above, allow_negotiation, allow_upsell)
  VALUES (_merchant_id, 5, 50000, 25000, false, true)
  ON CONFLICT (merchant_id) DO NOTHING;

  RETURN _merchant_id;
END; $$;

REVOKE ALL ON FUNCTION public.bootstrap_current_user(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_current_user(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_current_user(TEXT, TEXT) TO service_role;