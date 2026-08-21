-- Phase 04: negotiation + growth recommendation state (additive only)

CREATE TYPE public.negotiation_status AS ENUM ('open', 'agreed', 'rejected', 'expired', 'closed');
CREATE TYPE public.policy_decision AS ENUM ('accept', 'counter', 'reject');
CREATE TYPE public.offer_status AS ENUM ('proposed', 'accepted', 'rejected', 'expired');
CREATE TYPE public.recommendation_type AS ENUM ('upsell', 'cross_sell');

CREATE TABLE public.negotiation_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_session_id UUID NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  status public.negotiation_status NOT NULL DEFAULT 'open',
  round_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX negotiation_sessions_buyer_idx ON public.negotiation_sessions (buyer_session_id);
CREATE UNIQUE INDEX negotiation_sessions_unique_open
  ON public.negotiation_sessions (buyer_session_id, product_id);

CREATE TABLE public.negotiation_rounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.negotiation_sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  customer_request_summary TEXT,
  requested_discount_percent NUMERIC NOT NULL DEFAULT 0,
  proposed_discount_percent NUMERIC NOT NULL DEFAULT 0,
  allowed_discount_percent NUMERIC NOT NULL DEFAULT 0,
  policy_decision public.policy_decision NOT NULL,
  policy_reason TEXT,
  response_summary TEXT,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, round_number)
);
CREATE INDEX negotiation_rounds_session_idx ON public.negotiation_rounds (session_id);

CREATE TABLE public.offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  negotiation_session_id UUID NOT NULL REFERENCES public.negotiation_sessions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  base_amount NUMERIC NOT NULL,
  requested_discount_percent NUMERIC NOT NULL DEFAULT 0,
  approved_discount_percent NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  final_amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  requires_merchant_approval BOOLEAN NOT NULL DEFAULT false,
  status public.offer_status NOT NULL DEFAULT 'proposed',
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX offers_session_idx ON public.offers (negotiation_session_id);

CREATE TABLE public.growth_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_session_id UUID NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  source_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  recommended_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  recommendation_type public.recommendation_type NOT NULL,
  reason TEXT,
  recommended_price NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  accepted BOOLEAN NOT NULL DEFAULT false,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX growth_recommendations_session_idx ON public.growth_recommendations (buyer_session_id);

-- Grants
GRANT SELECT ON public.negotiation_sessions TO authenticated;
GRANT ALL ON public.negotiation_sessions TO service_role;
GRANT SELECT ON public.negotiation_rounds TO authenticated;
GRANT ALL ON public.negotiation_rounds TO service_role;
GRANT SELECT ON public.offers TO authenticated;
GRANT ALL ON public.offers TO service_role;
GRANT SELECT, UPDATE ON public.growth_recommendations TO authenticated;
GRANT ALL ON public.growth_recommendations TO service_role;

ALTER TABLE public.negotiation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negotiation_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY negotiation_sessions_read ON public.negotiation_sessions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agent_sessions s
    WHERE s.id = negotiation_sessions.buyer_session_id
      AND (s.user_id = auth.uid() OR public.owns_merchant(s.merchant_id))
  )
  OR public.owns_merchant(merchant_id)
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY negotiation_rounds_read ON public.negotiation_rounds
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.negotiation_sessions n
    JOIN public.agent_sessions s ON s.id = n.buyer_session_id
    WHERE n.id = negotiation_rounds.session_id
      AND (s.user_id = auth.uid() OR public.owns_merchant(n.merchant_id) OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY offers_read ON public.offers
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.negotiation_sessions n
    JOIN public.agent_sessions s ON s.id = n.buyer_session_id
    WHERE n.id = offers.negotiation_session_id
      AND (s.user_id = auth.uid() OR public.owns_merchant(n.merchant_id) OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY growth_recommendations_read ON public.growth_recommendations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agent_sessions s
    WHERE s.id = growth_recommendations.buyer_session_id
      AND (s.user_id = auth.uid() OR public.owns_merchant(growth_recommendations.merchant_id))
  )
  OR public.owns_merchant(merchant_id)
  OR public.has_role(auth.uid(), 'admin')
);

-- Buyers may only flag their own recommendation as accepted.
CREATE POLICY growth_recommendations_accept ON public.growth_recommendations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agent_sessions s
    WHERE s.id = growth_recommendations.buyer_session_id AND s.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agent_sessions s
    WHERE s.id = growth_recommendations.buyer_session_id AND s.user_id = auth.uid()
  )
);

CREATE TRIGGER negotiation_sessions_set_updated_at
BEFORE UPDATE ON public.negotiation_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();