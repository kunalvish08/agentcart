CREATE TYPE public.revenue_event AS ENUM (
  'REVENUE_OPPORTUNITY_DETECTED',
  'RECOMMENDATION_SHOWN',
  'RECOMMENDATION_ACCEPTED',
  'RECOMMENDATION_REJECTED',
  'UPSELL_ACCEPTED',
  'CROSS_SELL_ACCEPTED'
);

CREATE TABLE public.revenue_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  buyer_session_id uuid REFERENCES public.agent_sessions(id) ON DELETE SET NULL,
  recommendation_id uuid REFERENCES public.growth_recommendations(id) ON DELETE SET NULL,
  source_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  event public.revenue_event NOT NULL,
  recommendation_type public.recommendation_type,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  reason text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX revenue_events_merchant_created_idx ON public.revenue_events (merchant_id, created_at DESC);
CREATE INDEX revenue_events_session_idx ON public.revenue_events (buyer_session_id);

GRANT SELECT ON public.revenue_events TO authenticated;
GRANT ALL ON public.revenue_events TO service_role;

ALTER TABLE public.revenue_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchant owners read their revenue events"
  ON public.revenue_events FOR SELECT TO authenticated
  USING (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));