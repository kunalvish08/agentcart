-- Phase 09 — Evaluation Lab

CREATE TYPE public.evaluation_status AS ENUM ('queued','running','paused','completed','failed','cancelled');
CREATE TYPE public.evaluation_baseline AS ENUM ('traditional','agentic','safety');
CREATE TYPE public.evaluation_result_status AS ENUM ('pending','running','completed','failed','skipped');

CREATE TABLE public.evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'live',
  dataset_version text NOT NULL,
  dataset_seed text NOT NULL,
  prompt_version text NOT NULL,
  model text NOT NULL,
  model_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  scenario_count integer NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  batch_size integer NOT NULL DEFAULT 20,
  status public.evaluation_status NOT NULL DEFAULT 'queued',
  paused_reason text,
  notes text,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  catalog_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_version text,
  catalog_version text,
  synthetic boolean NOT NULL DEFAULT true,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.evaluation_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.evaluation_runs(id) ON DELETE CASCADE,
  scenario_id text NOT NULL,
  sequence integer NOT NULL,
  category text NOT NULL,
  intent text NOT NULL,
  budget numeric,
  target_category text,
  target_product text,
  quantity integer NOT NULL DEFAULT 1,
  discount_request numeric,
  expected_outcome text NOT NULL,
  difficulty text NOT NULL,
  in_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, scenario_id)
);

CREATE TABLE public.evaluation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.evaluation_runs(id) ON DELETE CASCADE,
  scenario_row_id uuid REFERENCES public.evaluation_scenarios(id) ON DELETE CASCADE,
  scenario_id text NOT NULL,
  baseline_type public.evaluation_baseline NOT NULL,
  status public.evaluation_result_status NOT NULL DEFAULT 'pending',
  selected_product text,
  selected_product_id uuid,
  gross_amount numeric,
  discount numeric,
  final_amount numeric,
  currency text,
  converted boolean NOT NULL DEFAULT false,
  cross_sell boolean NOT NULL DEFAULT false,
  cross_sell_amount numeric,
  policy_result text,
  expected_outcome text,
  actual_outcome text,
  outcome_match boolean,
  safely_contained boolean,
  hallucinated_product boolean NOT NULL DEFAULT false,
  approval_required boolean NOT NULL DEFAULT false,
  quote_issued boolean NOT NULL DEFAULT false,
  negotiated boolean NOT NULL DEFAULT false,
  latency_ms integer,
  model_latency_ms integer,
  tool_calls integer NOT NULL DEFAULT 0,
  prompt_tokens integer,
  completion_tokens integer,
  ai_cost numeric,
  agent_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  agent_session_id uuid REFERENCES public.agent_sessions(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  failure_reason text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, scenario_id, baseline_type)
);

CREATE TABLE public.evaluation_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.evaluation_runs(id) ON DELETE CASCADE,
  computed_at timestamptz NOT NULL DEFAULT now(),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id)
);

CREATE TABLE public.evaluation_job_locks (
  lock_key text PRIMARY KEY,
  run_id uuid REFERENCES public.evaluation_runs(id) ON DELETE CASCADE,
  holder text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX idx_eval_runs_merchant ON public.evaluation_runs(merchant_id, created_at DESC);
CREATE INDEX idx_eval_scenarios_run ON public.evaluation_scenarios(run_id, sequence);
CREATE INDEX idx_eval_results_run ON public.evaluation_results(run_id, baseline_type, status);

CREATE TRIGGER trg_eval_runs_updated BEFORE UPDATE ON public.evaluation_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_eval_results_updated BEFORE UPDATE ON public.evaluation_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.evaluation_runs TO authenticated;
GRANT SELECT ON public.evaluation_scenarios TO authenticated;
GRANT SELECT ON public.evaluation_results TO authenticated;
GRANT SELECT ON public.evaluation_metrics TO authenticated;
GRANT ALL ON public.evaluation_runs TO service_role;
GRANT ALL ON public.evaluation_scenarios TO service_role;
GRANT ALL ON public.evaluation_results TO service_role;
GRANT ALL ON public.evaluation_metrics TO service_role;
GRANT ALL ON public.evaluation_job_locks TO service_role;

ALTER TABLE public.evaluation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_job_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can view evaluation runs"
  ON public.evaluation_runs FOR SELECT TO authenticated
  USING (public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners and admins can view evaluation scenarios"
  ON public.evaluation_scenarios FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evaluation_runs r
    WHERE r.id = evaluation_scenarios.run_id
      AND (public.owns_merchant(r.merchant_id) OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Owners and admins can view evaluation results"
  ON public.evaluation_results FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evaluation_runs r
    WHERE r.id = evaluation_results.run_id
      AND (public.owns_merchant(r.merchant_id) OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Owners and admins can view evaluation metrics"
  ON public.evaluation_metrics FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evaluation_runs r
    WHERE r.id = evaluation_metrics.run_id
      AND (public.owns_merchant(r.merchant_id) OR public.has_role(auth.uid(), 'admin'))
  ));