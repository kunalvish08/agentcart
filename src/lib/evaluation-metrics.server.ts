// Phase 09 — metrics computation.
//
// Every number here is derived from persisted `evaluation_results` rows, which in
// turn record only what the server returned. Nothing is estimated or invented:
// where a figure cannot be derived (AI cost in currency, for example) it is
// reported as null and the UI says why.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ArmMetrics = {
  sessions: number;
  conversions: number;
  conversion_rate: number;
  revenue: number;
  cross_sell_revenue: number;
  aov: number | null;
  revenue_per_session: number;
  cross_sell_rate: number;
  discount_total: number;
  discount_rate: number;
  gross_total: number;
  negotiated_sessions: number;
  approval_required: number;
  outcome_match_rate: number;
  safely_contained_rate: number;
  hallucination_rate: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  avg_tool_calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  failures: number;
};

export type EvaluationMetricsPayload = {
  computed_at: string;
  completed_results: number;
  traditional: ArmMetrics;
  agentic: ArmMetrics;
  lift: {
    conversion_rate_pp: number;
    revenue_per_session_pct: number | null;
    aov_pct: number | null;
    revenue_delta: number;
    cross_sell_rate_pp: number;
    discount_rate_pp: number;
  };
  safety: {
    total: number;
    passed: number;
    pass_rate: number;
    probes: Array<{ id: string; title: string; passed: boolean; evidence: string }>;
  };
  ai_cost: { currency_cost: null; note: string; prompt_tokens: number; completion_tokens: number };
  by_category: Array<{
    category: string;
    scenarios: number;
    traditional_conversions: number;
    agentic_conversions: number;
    traditional_revenue: number;
    agentic_revenue: number;
  }>;
};

type Row = {
  scenario_id: string;
  baseline_type: "traditional" | "agentic" | "safety";
  status: string;
  converted: boolean;
  cross_sell: boolean;
  cross_sell_amount: number | null;
  gross_amount: number | null;
  discount: number | null;
  final_amount: number | null;
  negotiated: boolean;
  approval_required: boolean;
  outcome_match: boolean | null;
  safely_contained: boolean | null;
  hallucinated_product: boolean;
  latency_ms: number | null;
  tool_calls: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  actual_outcome: string | null;
  detail: Record<string, any> | null;
};

const round = (value: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

function armMetrics(rows: Row[]): ArmMetrics {
  const sessions = rows.length;
  const conversions = rows.filter((r) => r.converted).length;
  const revenue = rows.reduce((sum, r) => sum + (r.converted ? Number(r.final_amount ?? 0) : 0), 0);
  const crossSellRevenue = rows.reduce(
    (sum, r) => sum + (r.cross_sell ? Number(r.cross_sell_amount ?? 0) : 0),
    0,
  );
  const grossTotal = rows.reduce((sum, r) => sum + (r.converted ? Number(r.gross_amount ?? 0) : 0), 0);
  const discountTotal = rows.reduce((sum, r) => sum + (r.converted ? Number(r.discount ?? 0) : 0), 0);
  const latencies = rows.map((r) => r.latency_ms ?? 0).filter((n) => n > 0);
  const graded = rows.filter((r) => r.outcome_match !== null);

  const totalRevenue = revenue + crossSellRevenue;
  return {
    sessions,
    conversions,
    conversion_rate: sessions ? round((conversions / sessions) * 100) : 0,
    revenue: round(revenue),
    cross_sell_revenue: round(crossSellRevenue),
    aov: conversions ? round(totalRevenue / conversions) : null,
    revenue_per_session: sessions ? round(totalRevenue / sessions) : 0,
    cross_sell_rate: conversions ? round((rows.filter((r) => r.cross_sell).length / conversions) * 100) : 0,
    discount_total: round(discountTotal),
    discount_rate: grossTotal ? round((discountTotal / grossTotal) * 100) : 0,
    gross_total: round(grossTotal),
    negotiated_sessions: rows.filter((r) => r.negotiated).length,
    approval_required: rows.filter((r) => r.approval_required).length,
    outcome_match_rate: graded.length
      ? round((graded.filter((r) => r.outcome_match).length / graded.length) * 100)
      : 0,
    safely_contained_rate: graded.length
      ? round((graded.filter((r) => r.safely_contained).length / graded.length) * 100)
      : 0,
    hallucination_rate: sessions
      ? round((rows.filter((r) => r.hallucinated_product).length / sessions) * 100)
      : 0,
    avg_latency_ms: latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null,
    p95_latency_ms: percentile(latencies, 95),
    avg_tool_calls: sessions ? round(rows.reduce((sum, r) => sum + (r.tool_calls ?? 0), 0) / sessions, 1) : 0,
    prompt_tokens: rows.reduce((sum, r) => sum + (r.prompt_tokens ?? 0), 0),
    completion_tokens: rows.reduce((sum, r) => sum + (r.completion_tokens ?? 0), 0),
    failures: rows.filter((r) => r.status === "failed" || r.outcome_match === false).length,
  };
}

export async function computeEvaluationMetrics(runId: string): Promise<EvaluationMetricsPayload> {
  const { data: resultRows } = await supabaseAdmin
    .from("evaluation_results")
    .select(
      "scenario_id, baseline_type, status, converted, cross_sell, cross_sell_amount, gross_amount, discount, final_amount, negotiated, approval_required, outcome_match, safely_contained, hallucinated_product, latency_ms, tool_calls, prompt_tokens, completion_tokens, actual_outcome, detail",
    )
    .eq("run_id", runId)
    .in("status", ["completed", "failed"]);

  const rows = (resultRows ?? []) as Row[];
  const traditional = rows.filter((r) => r.baseline_type === "traditional");
  const agentic = rows.filter((r) => r.baseline_type === "agentic");
  const safetyRows = rows.filter((r) => r.baseline_type === "safety");

  const t = armMetrics(traditional);
  const a = armMetrics(agentic);

  const { data: scenarioRows } = await supabaseAdmin
    .from("evaluation_scenarios")
    .select("scenario_id, category")
    .eq("run_id", runId)
    .eq("in_sample", true);
  const categoryOf = new Map(
    ((scenarioRows ?? []) as Array<{ scenario_id: string; category: string }>).map((r) => [
      r.scenario_id,
      r.category,
    ]),
  );

  const categoryMap = new Map<
    string,
    {
      category: string;
      scenarios: Set<string>;
      traditional_conversions: number;
      agentic_conversions: number;
      traditional_revenue: number;
      agentic_revenue: number;
    }
  >();
  for (const row of rows) {
    if (row.baseline_type === "safety") continue;
    const category = categoryOf.get(row.scenario_id) ?? "unknown";
    const entry =
      categoryMap.get(category) ??
      {
        category,
        scenarios: new Set<string>(),
        traditional_conversions: 0,
        agentic_conversions: 0,
        traditional_revenue: 0,
        agentic_revenue: 0,
      };
    entry.scenarios.add(row.scenario_id);
    const revenue = row.converted
      ? Number(row.final_amount ?? 0) + (row.cross_sell ? Number(row.cross_sell_amount ?? 0) : 0)
      : 0;
    if (row.baseline_type === "traditional") {
      entry.traditional_conversions += row.converted ? 1 : 0;
      entry.traditional_revenue += revenue;
    } else {
      entry.agentic_conversions += row.converted ? 1 : 0;
      entry.agentic_revenue += revenue;
    }
    categoryMap.set(category, entry);
  }

  const payload: EvaluationMetricsPayload = {
    computed_at: new Date().toISOString(),
    completed_results: rows.length,
    traditional: t,
    agentic: a,
    lift: {
      conversion_rate_pp: round(a.conversion_rate - t.conversion_rate),
      revenue_per_session_pct: t.revenue_per_session
        ? round(((a.revenue_per_session - t.revenue_per_session) / t.revenue_per_session) * 100)
        : null,
      aov_pct: t.aov && a.aov ? round(((a.aov - t.aov) / t.aov) * 100) : null,
      revenue_delta: round(
        a.revenue + a.cross_sell_revenue - (t.revenue + t.cross_sell_revenue),
      ),
      cross_sell_rate_pp: round(a.cross_sell_rate - t.cross_sell_rate),
      discount_rate_pp: round(a.discount_rate - t.discount_rate),
    },
    safety: {
      total: safetyRows.length,
      passed: safetyRows.filter((r) => r.outcome_match).length,
      pass_rate: safetyRows.length
        ? round((safetyRows.filter((r) => r.outcome_match).length / safetyRows.length) * 100)
        : 0,
      probes: safetyRows.map((r) => ({
        id: r.scenario_id,
        title: String(r.detail?.["title"] ?? r.scenario_id),
        passed: Boolean(r.outcome_match),
        evidence: String(r.detail?.["evidence"] ?? ""),
      })),
    },
    ai_cost: {
      currency_cost: null,
      note: "Token usage is measured per run. A currency cost is not shown because the model's price is not exposed to the application.",
      prompt_tokens: a.prompt_tokens,
      completion_tokens: a.completion_tokens,
    },
    by_category: [...categoryMap.values()]
      .map((entry) => ({
        category: entry.category,
        scenarios: entry.scenarios.size,
        traditional_conversions: entry.traditional_conversions,
        agentic_conversions: entry.agentic_conversions,
        traditional_revenue: round(entry.traditional_revenue),
        agentic_revenue: round(entry.agentic_revenue),
      }))
      .sort((x, y) => x.category.localeCompare(y.category)),
  };

  await supabaseAdmin
    .from("evaluation_metrics")
    .upsert({ run_id: runId, metrics: payload as unknown as never, computed_at: payload.computed_at }, { onConflict: "run_id" });

  return payload;
}
