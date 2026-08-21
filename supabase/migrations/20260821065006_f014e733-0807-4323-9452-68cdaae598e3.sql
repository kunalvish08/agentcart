-- Phase 06: Razorpay test-mode payment layer.

ALTER TYPE public.checkout_status ADD VALUE IF NOT EXISTS 'PAYMENT_CAPTURED';
ALTER TYPE public.checkout_status ADD VALUE IF NOT EXISTS 'COMPLETED';

ALTER TYPE public.checkout_event ADD VALUE IF NOT EXISTS 'PAYMENT_INITIALIZED';
ALTER TYPE public.checkout_event ADD VALUE IF NOT EXISTS 'RAZORPAY_ORDER_CREATED';
ALTER TYPE public.checkout_event ADD VALUE IF NOT EXISTS 'PAYMENT_AUTHORIZED';
ALTER TYPE public.checkout_event ADD VALUE IF NOT EXISTS 'PAYMENT_CAPTURED';
ALTER TYPE public.checkout_event ADD VALUE IF NOT EXISTS 'PAYMENT_VERIFIED';
ALTER TYPE public.checkout_event ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE public.checkout_event ADD VALUE IF NOT EXISTS 'WEBHOOK_RECEIVED';
ALTER TYPE public.checkout_event ADD VALUE IF NOT EXISTS 'WEBHOOK_DUPLICATE';
ALTER TYPE public.checkout_event ADD VALUE IF NOT EXISTS 'WEBHOOK_REJECTED';
ALTER TYPE public.checkout_event ADD VALUE IF NOT EXISTS 'ORDER_COMPLETED';
ALTER TYPE public.checkout_event ADD VALUE IF NOT EXISTS 'RECONCILIATION_RUN';

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM (
    'CREATED','PENDING','AUTHORIZED','CAPTURED','VERIFIED','FAILED','REFUNDED','CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Visibility helper (SECURITY DEFINER so payment policies do not depend on orders RLS).
CREATE OR REPLACE FUNCTION public.can_view_order(_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.merchants m ON m.id = o.merchant_id
    LEFT JOIN public.agent_sessions s ON s.id = o.buyer_session_id
    WHERE o.id = _order_id
      AND (m.owner_id = auth.uid() OR s.user_id = auth.uid())
  ) OR public.has_role(auth.uid(), 'admin');
$$;

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  mode TEXT NOT NULL DEFAULT 'test',
  razorpay_order_id TEXT NOT NULL,
  razorpay_payment_id TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status public.payment_status NOT NULL DEFAULT 'CREATED',
  method TEXT,
  authorized_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Duplicate-capture protection: one payment attempt per order, and each Razorpay
-- order / payment identifier may only ever map to a single row.
CREATE UNIQUE INDEX IF NOT EXISTS payments_order_id_key ON public.payments(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_razorpay_order_id_key ON public.payments(razorpay_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_razorpay_payment_id_key
  ON public.payments(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_involved" ON public.payments;
CREATE POLICY "payments_select_involved" ON public.payments
  FOR SELECT TO authenticated USING (public.can_view_order(order_id));

DROP TRIGGER IF EXISTS payments_set_updated_at ON public.payments;
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Deterministic payment state machine, mirrored in TypeScript.
CREATE OR REPLACE FUNCTION public.enforce_payment_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE allowed public.payment_status[];
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  allowed := CASE OLD.status
    WHEN 'CREATED'    THEN ARRAY['PENDING','AUTHORIZED','CAPTURED','FAILED','CANCELLED']::public.payment_status[]
    WHEN 'PENDING'    THEN ARRAY['AUTHORIZED','CAPTURED','FAILED','CANCELLED']::public.payment_status[]
    WHEN 'AUTHORIZED' THEN ARRAY['CAPTURED','FAILED','CANCELLED']::public.payment_status[]
    WHEN 'CAPTURED'   THEN ARRAY['VERIFIED','REFUNDED']::public.payment_status[]
    WHEN 'VERIFIED'   THEN ARRAY['REFUNDED']::public.payment_status[]
    ELSE ARRAY[]::public.payment_status[]
  END;

  IF NOT (NEW.status = ANY (allowed)) THEN
    RAISE EXCEPTION 'invalid payment transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS payments_enforce_transition ON public.payments;
CREATE TRIGGER payments_enforce_transition BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_transition();

-- Amount integrity: a payment must always mirror its order's authoritative total.
CREATE OR REPLACE FUNCTION public.enforce_payment_amount()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE order_amount NUMERIC(12,2); order_currency TEXT; order_merchant UUID;
BEGIN
  SELECT o.final_amount, o.currency, o.merchant_id
    INTO order_amount, order_currency, order_merchant
  FROM public.orders o WHERE o.id = NEW.order_id;

  IF order_amount IS NULL THEN
    RAISE EXCEPTION 'payment references an unknown order';
  END IF;
  IF NEW.amount <> order_amount OR NEW.currency <> order_currency OR NEW.merchant_id <> order_merchant THEN
    RAISE EXCEPTION 'payment amount/currency/merchant must match the authoritative order'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.amount_minor <> ROUND(order_amount * 100)::BIGINT THEN
    RAISE EXCEPTION 'payment minor amount must equal the order total in paise'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS payments_enforce_amount ON public.payments;
CREATE TRIGGER payments_enforce_amount BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_amount();

-- Webhook idempotency ledger. No secrets, no raw payload: only a hash.
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  payload_hash TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_event_id_key
  ON public.webhook_events(provider, event_id);

GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_events_select_involved" ON public.webhook_events;
CREATE POLICY "webhook_events_select_involved" ON public.webhook_events
  FOR SELECT TO authenticated
  USING (order_id IS NOT NULL AND public.can_view_order(order_id));

DROP TRIGGER IF EXISTS webhook_events_set_updated_at ON public.webhook_events;
CREATE TRIGGER webhook_events_set_updated_at BEFORE UPDATE ON public.webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Order state machine gains the payment path: PAYMENT_PENDING -> PAYMENT_CAPTURED -> COMPLETED.
CREATE OR REPLACE FUNCTION public.enforce_order_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE allowed public.checkout_status[];
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  allowed := CASE OLD.status
    WHEN 'QUOTE_CREATED' THEN ARRAY['CHECKOUT_REQUESTED','CANCELLED','EXPIRED']::public.checkout_status[]
    WHEN 'CHECKOUT_REQUESTED' THEN ARRAY['APPROVAL_REQUIRED','APPROVED','REJECTED','CANCELLED','EXPIRED']::public.checkout_status[]
    WHEN 'APPROVAL_REQUIRED' THEN ARRAY['APPROVED','REJECTED','CANCELLED','EXPIRED']::public.checkout_status[]
    WHEN 'APPROVED' THEN ARRAY['ORDER_CREATED','CANCELLED','EXPIRED']::public.checkout_status[]
    WHEN 'ORDER_CREATED' THEN ARRAY['PAYMENT_PENDING','CANCELLED','EXPIRED']::public.checkout_status[]
    WHEN 'PAYMENT_PENDING' THEN ARRAY['PAYMENT_CAPTURED','CANCELLED','EXPIRED']::public.checkout_status[]
    WHEN 'PAYMENT_CAPTURED' THEN ARRAY['COMPLETED']::public.checkout_status[]
    ELSE ARRAY[]::public.checkout_status[]
  END;

  IF NOT (NEW.status = ANY (allowed)) THEN
    RAISE EXCEPTION 'invalid checkout transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;