-- Public discovery layer for Phase 02

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS agent_commerce_enabled boolean NOT NULL DEFAULT true;

UPDATE public.merchants
SET slug = COALESCE(slug, regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS merchants_slug_key ON public.merchants (slug);

-- Server-calculated quotes (created by trusted server code only)
CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  base_amount numeric(14,2) NOT NULL,
  requested_discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  allowed_discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  final_amount numeric(14,2) NOT NULL,
  currency text NOT NULL,
  policy_applied boolean NOT NULL DEFAULT false,
  policy_reason text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotes_select ON public.quotes
  FOR SELECT TO authenticated
  USING (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Lightweight public API request logs (no payloads, no secrets)
CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer NOT NULL,
  success boolean NOT NULL,
  latency_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_request_logs_created_at_idx ON public.api_request_logs (created_at DESC);

GRANT SELECT ON public.api_request_logs TO authenticated;
GRANT ALL ON public.api_request_logs TO service_role;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_request_logs_select ON public.api_request_logs
  FOR SELECT TO authenticated
  USING (
    (merchant_id IS NOT NULL AND public.owns_merchant(merchant_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );