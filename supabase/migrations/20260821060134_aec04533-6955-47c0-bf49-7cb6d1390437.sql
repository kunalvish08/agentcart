-- Phase 05 — agentic checkout, server-authoritative orders, human-in-the-loop approval.

CREATE TYPE public.checkout_status AS ENUM (
  'QUOTE_CREATED',
  'CHECKOUT_REQUESTED',
  'APPROVAL_REQUIRED',
  'APPROVED',
  'REJECTED',
  'ORDER_CREATED',
  'PAYMENT_PENDING',
  'CANCELLED',
  'EXPIRED'
);

CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE public.audit_actor_type AS ENUM ('ai_agent', 'merchant', 'system', 'buyer');

CREATE TYPE public.checkout_event AS ENUM (
  'CHECKOUT_REQUESTED',
  'APPROVAL_REQUIRED',
  'APPROVED',
  'REJECTED',
  'ORDER_CREATED',
  'PAYMENT_PENDING',
  'CHECKOUT_FAILED',
  'CANCELLED',
  'EXPIRED'
);

-- helper: does the caller own this AI buyer session?
CREATE OR REPLACE FUNCTION public.owns_agent_session(_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agent_sessions s
    WHERE s.id = _session_id AND s.user_id = auth.uid()
  );
$$;

/* --------------------------------- orders --------------------------------- */

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  buyer_session_id uuid NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  status public.checkout_status NOT NULL DEFAULT 'CHECKOUT_REQUESTED',
  currency text NOT NULL DEFAULT 'INR',
  subtotal_amount numeric(14,2) NOT NULL,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  final_amount numeric(14,2) NOT NULL,
  approval_required boolean NOT NULL DEFAULT false,
  approval_reason text,
  customer_request_summary text,
  negotiation_summary text,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by uuid,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT orders_amounts_non_negative CHECK (
    subtotal_amount >= 0 AND discount_amount >= 0 AND final_amount >= 0
  ),
  CONSTRAINT orders_idempotency_key_len CHECK (char_length(idempotency_key) BETWEEN 8 AND 128)
);

CREATE UNIQUE INDEX orders_idempotency_unique
  ON public.orders (merchant_id, buyer_session_id, idempotency_key);
CREATE INDEX orders_merchant_status_idx ON public.orders (merchant_id, status, created_at DESC);
CREATE INDEX orders_buyer_session_idx ON public.orders (buyer_session_id, created_at DESC);

GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants read their own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Buyers read orders from their own sessions" ON public.orders
  FOR SELECT TO authenticated
  USING (public.owns_agent_session(buyer_session_id));

CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- deterministic state machine, enforced by the database itself
CREATE OR REPLACE FUNCTION public.enforce_order_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  allowed public.checkout_status[];
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  allowed := CASE OLD.status
    WHEN 'QUOTE_CREATED' THEN ARRAY['CHECKOUT_REQUESTED','CANCELLED','EXPIRED']::public.checkout_status[]
    WHEN 'CHECKOUT_REQUESTED' THEN ARRAY['APPROVAL_REQUIRED','APPROVED','REJECTED','CANCELLED','EXPIRED']::public.checkout_status[]
    WHEN 'APPROVAL_REQUIRED' THEN ARRAY['APPROVED','REJECTED','CANCELLED','EXPIRED']::public.checkout_status[]
    WHEN 'APPROVED' THEN ARRAY['ORDER_CREATED','CANCELLED','EXPIRED']::public.checkout_status[]
    WHEN 'ORDER_CREATED' THEN ARRAY['PAYMENT_PENDING','CANCELLED','EXPIRED']::public.checkout_status[]
    -- Phase 05 ends at PAYMENT_PENDING: payment capture belongs to a later phase.
    WHEN 'PAYMENT_PENDING' THEN ARRAY['CANCELLED','EXPIRED']::public.checkout_status[]
    ELSE ARRAY[]::public.checkout_status[]
  END;

  IF NOT (NEW.status = ANY (allowed)) THEN
    RAISE EXCEPTION 'invalid checkout transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_enforce_transition BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_transition();

/* ------------------------------- order items ------------------------------ */

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  final_unit_price numeric(14,2) NOT NULL CHECK (final_unit_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_items_order_idx ON public.order_items (order_id);

GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Order items follow order visibility" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (
          public.owns_merchant(o.merchant_id)
          OR public.has_role(auth.uid(), 'admin')
          OR public.owns_agent_session(o.buyer_session_id)
        )
    )
  );

/* --------------------------- checkout approvals --------------------------- */

CREATE TABLE public.checkout_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  status public.approval_status NOT NULL DEFAULT 'pending',
  reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX checkout_approvals_merchant_status_idx
  ON public.checkout_approvals (merchant_id, status, requested_at DESC);

GRANT SELECT ON public.checkout_approvals TO authenticated;
GRANT ALL ON public.checkout_approvals TO service_role;
ALTER TABLE public.checkout_approvals ENABLE ROW LEVEL SECURITY;

-- Merchants (and admins) can see their queue. Buyers can never read or write it.
CREATE POLICY "Merchants read their approval queue" ON public.checkout_approvals
  FOR SELECT TO authenticated
  USING (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER checkout_approvals_set_updated_at BEFORE UPDATE ON public.checkout_approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ------------------------- checkout audit events -------------------------- */

CREATE TABLE public.checkout_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  buyer_session_id uuid REFERENCES public.agent_sessions(id) ON DELETE SET NULL,
  event public.checkout_event NOT NULL,
  actor_type public.audit_actor_type NOT NULL,
  actor_id text,
  from_status public.checkout_status,
  to_status public.checkout_status,
  reason text,
  policy_decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX checkout_audit_order_idx ON public.checkout_audit_events (order_id, created_at);
CREATE INDEX checkout_audit_merchant_idx ON public.checkout_audit_events (merchant_id, created_at DESC);

GRANT SELECT ON public.checkout_audit_events TO authenticated;
GRANT ALL ON public.checkout_audit_events TO service_role;
ALTER TABLE public.checkout_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants read their checkout audit trail" ON public.checkout_audit_events
  FOR SELECT TO authenticated
  USING (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Buyers read audit events for their own sessions" ON public.checkout_audit_events
  FOR SELECT TO authenticated
  USING (buyer_session_id IS NOT NULL AND public.owns_agent_session(buyer_session_id));