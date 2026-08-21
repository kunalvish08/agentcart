CREATE TYPE public.agent_status AS ENUM ('running','completed','failed','stopped');

CREATE TABLE public.agent_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  title TEXT,
  status public.agent_status NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.agent_sessions(id) ON DELETE CASCADE,
  status public.agent_status NOT NULL DEFAULT 'running',
  model TEXT NOT NULL,
  gateway_run_id TEXT,
  user_request TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  step_count INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  stop_reason TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  input_summary TEXT,
  output_summary TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tool_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.agent_steps(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  input_json JSONB,
  output_json JSONB,
  status TEXT NOT NULL DEFAULT 'success',
  latency_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_sessions_user ON public.agent_sessions(user_id, created_at DESC);
CREATE INDEX idx_agent_runs_session ON public.agent_runs(session_id, created_at DESC);
CREATE INDEX idx_agent_steps_run ON public.agent_steps(run_id, step_number);
CREATE INDEX idx_tool_calls_run ON public.tool_calls(run_id, created_at);

GRANT SELECT ON public.agent_sessions TO authenticated;
GRANT SELECT ON public.agent_runs TO authenticated;
GRANT SELECT ON public.agent_steps TO authenticated;
GRANT SELECT ON public.tool_calls TO authenticated;
GRANT ALL ON public.agent_sessions TO service_role;
GRANT ALL ON public.agent_runs TO service_role;
GRANT ALL ON public.agent_steps TO service_role;
GRANT ALL ON public.tool_calls TO service_role;

ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_sessions_read" ON public.agent_sessions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.owns_merchant(merchant_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "agent_runs_read" ON public.agent_runs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agent_sessions s
  WHERE s.id = agent_runs.session_id
    AND (s.user_id = auth.uid() OR public.owns_merchant(s.merchant_id) OR public.has_role(auth.uid(), 'admin'))
));

CREATE POLICY "agent_steps_read" ON public.agent_steps FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agent_runs r
  JOIN public.agent_sessions s ON s.id = r.session_id
  WHERE r.id = agent_steps.run_id
    AND (s.user_id = auth.uid() OR public.owns_merchant(s.merchant_id) OR public.has_role(auth.uid(), 'admin'))
));

CREATE POLICY "tool_calls_read" ON public.tool_calls FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.agent_runs r
  JOIN public.agent_sessions s ON s.id = r.session_id
  WHERE r.id = tool_calls.run_id
    AND (s.user_id = auth.uid() OR public.owns_merchant(s.merchant_id) OR public.has_role(auth.uid(), 'admin'))
));