import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Buyer accepts a merchant growth recommendation (the only buyer-writable flag). */
export const acceptRecommendation = createServerFn({ method: "POST" })
  .inputValidator((data: { recommendationId: string }) =>
    z.object({ recommendationId: z.string().uuid() }).parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<{ accepted: true }> => {
    const { error } = await context.supabase
      .from("growth_recommendations")
      .update({ accepted: true })
      .eq("id", data.recommendationId);
    if (error) throw new Error(error.message);
    return { accepted: true };
  });


export type AgentSessionSummary = {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  runs: number;
  last_model: string | null;
  total_tool_calls: number;
};

export type AgentTraceStep = {
  id: string;
  step_number: number;
  step_type: string;
  status: string;
  input_summary: string | null;
  output_summary: string | null;
  latency_ms: number | null;
  tool_name?: string | null;
};

/** Recent AI Buyer sessions for the signed-in user (RLS-scoped). */
export const listAgentSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgentSessionSummary[]> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("agent_sessions")
      .select("id, title, status, created_at, agent_runs(id, model, tool_call_count)")
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const runs = (row.agent_runs ?? []) as Array<{ model: string; tool_call_count: number }>;
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        created_at: row.created_at,
        runs: runs.length,
        last_model: runs[runs.length - 1]?.model ?? null,
        total_tool_calls: runs.reduce((sum, r) => sum + (r.tool_call_count ?? 0), 0),
      };
    });
  });

/** Persisted trace for one run: steps + tool call metadata (RLS-scoped). */
export const getAgentRunTrace = createServerFn({ method: "GET" })
  .inputValidator((data: { runId: string }) => z.object({ runId: z.string().uuid() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const [runResult, stepsResult, toolsResult] = await Promise.all([
      supabase
        .from("agent_runs")
        .select(
          "id, status, model, step_count, tool_call_count, duration_ms, stop_reason, error, total_tokens, gateway_run_id, created_at",
        )
        .eq("id", data.runId)
        .maybeSingle(),
      supabase
        .from("agent_steps")
        .select("id, step_number, step_type, status, input_summary, output_summary, latency_ms")
        .eq("run_id", data.runId)
        .order("step_number", { ascending: true }),
      supabase
        .from("tool_calls")
        .select("id, step_id, tool_name, status, latency_ms, error")
        .eq("run_id", data.runId),
    ]);
    if (runResult.error) throw new Error(runResult.error.message);
    if (stepsResult.error) throw new Error(stepsResult.error.message);
    if (toolsResult.error) throw new Error(toolsResult.error.message);

    const toolByStep = new Map(
      (toolsResult.data ?? []).map((t) => [t.step_id ?? "", t.tool_name as string]),
    );

    return {
      run: runResult.data,
      steps: (stepsResult.data ?? []).map((s) => ({
        ...s,
        tool_name: toolByStep.get(s.id) ?? null,
      })) as AgentTraceStep[],
      tool_calls: toolsResult.data ?? [],
    };
  });
