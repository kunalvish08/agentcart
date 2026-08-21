// Phase 08 — evaluation metrics for external AI buyer runs.
//
// Every number here is READ from persisted rows (agent_runs, agent_steps,
// tool_calls, api_request_logs, orders). Nothing is estimated or fabricated.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { EXTERNAL_BUYER_MODEL } from "@/lib/external-buyer.server";

export type ToolMetric = {
  tool_name: string;
  calls: number;
  success: number;
  failed: number;
  avg_latency_ms: number | null;
};

export type ExternalBuyerMetrics = {
  runs: {
    total: number;
    completed: number;
    failed: number;
    stopped: number;
    avg_duration_ms: number | null;
    avg_tool_calls: number | null;
  };
  funnel: {
    manifest_discovery: number;
    catalog_or_search: number;
    product_selected: number;
    quote_issued: number;
    negotiation_completed: number;
    checkout_requested: number;
  };
  safety: {
    policy_capped_quotes: number;
    refused_tool_calls: number;
    no_match_runs: number;
    approval_required_orders: number;
  };
  api: {
    public_requests: number;
    avg_latency_ms: number | null;
    error_responses: number;
    by_endpoint: Array<{ endpoint: string; requests: number; errors: number; avg_latency_ms: number | null }>;
  };
  tools: ToolMetric[];
  generated_at: string;
};

const EXTERNAL_ENDPOINTS = [
  "/.well-known/agent-manifest",
  "/api/public/catalog",
  "/api/public/search",
  "/api/public/products/:id",
  "/api/public/quote",
  "/api/public/negotiate",
  "/api/public/checkout",
  "/api/public/orders/:id",
];

function avg(values: number[]): number | null {
  const usable = values.filter((v) => Number.isFinite(v));
  if (usable.length === 0) return null;
  return Math.round(usable.reduce((a, b) => a + b, 0) / usable.length);
}

export async function collectExternalBuyerMetrics(userId: string): Promise<ExternalBuyerMetrics> {
  const empty: ExternalBuyerMetrics = {
    runs: { total: 0, completed: 0, failed: 0, stopped: 0, avg_duration_ms: null, avg_tool_calls: null },
    funnel: {
      manifest_discovery: 0,
      catalog_or_search: 0,
      product_selected: 0,
      quote_issued: 0,
      negotiation_completed: 0,
      checkout_requested: 0,
    },
    safety: {
      policy_capped_quotes: 0,
      refused_tool_calls: 0,
      no_match_runs: 0,
      approval_required_orders: 0,
    },
    api: { public_requests: 0, avg_latency_ms: null, error_responses: 0, by_endpoint: [] },
    tools: [],
    generated_at: new Date().toISOString(),
  };

  const { data: sessions } = await supabaseAdmin
    .from("agent_sessions")
    .select("id")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(300);
  const sessionIds = (sessions ?? []).map((s) => s.id);

  const runs = sessionIds.length
    ? ((
        await supabaseAdmin
          .from("agent_runs")
          .select("id, status, duration_ms, tool_call_count, step_count")
          .in("session_id", sessionIds)
          .eq("model", EXTERNAL_BUYER_MODEL)
          .order("started_at", { ascending: false })
          .limit(100)
      ).data ?? [])
    : [];

  const runIds = runs.map((r) => r.id);

  const calls = runIds.length
    ? ((
        await supabaseAdmin
          .from("tool_calls")
          .select("run_id, tool_name, status, latency_ms, output_json")
          .in("run_id", runIds)
          .limit(1000)
      ).data ?? [])
    : [];

  const logs =
    (
      await supabaseAdmin
        .from("api_request_logs")
        .select("endpoint, status_code, latency_ms, success")
        .in("endpoint", EXTERNAL_ENDPOINTS)
        .order("created_at", { ascending: false })
        .limit(1000)
    ).data ?? [];

  const orders = sessionIds.length
    ? ((
        await supabaseAdmin
          .from("orders")
          .select("id, status, buyer_session_id")
          .in("buyer_session_id", sessionIds)
          .limit(500)
      ).data ?? [])
    : [];

  if (runs.length === 0 && logs.length === 0) return empty;

  // ---- run-level ----
  const metrics = { ...empty, generated_at: new Date().toISOString() };
  metrics.runs = {
    total: runs.length,
    completed: runs.filter((r) => r.status === "completed").length,
    failed: runs.filter((r) => r.status === "failed").length,
    stopped: runs.filter((r) => r.status === "stopped").length,
    avg_duration_ms: avg(runs.map((r) => Number(r.duration_ms ?? NaN))),
    avg_tool_calls: avg(runs.map((r) => Number(r.tool_call_count ?? NaN))),
  };

  // ---- funnel + safety from persisted tool calls ----
  const runsWith = (predicate: (call: (typeof calls)[number]) => boolean) =>
    new Set(calls.filter(predicate).map((c) => c.run_id)).size;

  const ok = (name: string) => (c: (typeof calls)[number]) =>
    c.tool_name === name && c.status === "success";

  const searchCalls = calls.filter(ok("search_catalog"));
  const emptySearchRuns = new Set(
    searchCalls
      .filter((c) => {
        const data = ((c.output_json as any)?.data ?? {}) as Record<string, any>;
        return Number(data["count"] ?? (data["results"]?.length ?? 0)) === 0;
      })
      .map((c) => c.run_id),
  );
  const nonEmptySearchRuns = new Set(
    searchCalls
      .filter((c) => {
        const data = ((c.output_json as any)?.data ?? {}) as Record<string, any>;
        return Number(data["count"] ?? (data["results"]?.length ?? 0)) > 0;
      })
      .map((c) => c.run_id),
  );

  const quoteCalls = calls.filter((c) => ok("get_quote")(c) || ok("negotiate")(c));
  const cappedQuotes = calls.filter((c) => {
    if (c.tool_name !== "negotiate" || c.status !== "success") return false;
    const data = ((c.output_json as any)?.data ?? {}) as Record<string, any>;
    return String(data["decision"] ?? "") === "counter";
  }).length;

  metrics.funnel = {
    manifest_discovery: runsWith(ok("discover_merchant")),
    catalog_or_search: runsWith(ok("search_catalog")),
    product_selected: runsWith(ok("get_product")),
    quote_issued: new Set(quoteCalls.map((c) => c.run_id)).size,
    negotiation_completed: runsWith(ok("negotiate")),
    checkout_requested: runsWith((c) => c.tool_name === "request_checkout"),
  };

  metrics.safety = {
    policy_capped_quotes: cappedQuotes,
    refused_tool_calls: calls.filter((c) => c.status !== "success").length,
    no_match_runs: [...emptySearchRuns].filter((id) => !nonEmptySearchRuns.has(id)).length,
    approval_required_orders: orders.filter((o) => o.status === "APPROVAL_REQUIRED").length,
  };

  // ---- tool metrics ----
  const byTool = new Map<string, ToolMetric & { latencies: number[] }>();
  for (const call of calls) {
    const entry =
      byTool.get(call.tool_name) ??
      ({
        tool_name: call.tool_name,
        calls: 0,
        success: 0,
        failed: 0,
        avg_latency_ms: null,
        latencies: [],
      } as ToolMetric & { latencies: number[] });
    entry.calls += 1;
    if (call.status === "success") entry.success += 1;
    else entry.failed += 1;
    if (call.latency_ms !== null) entry.latencies.push(Number(call.latency_ms));
    byTool.set(call.tool_name, entry);
  }
  metrics.tools = [...byTool.values()]
    .map(({ latencies, ...rest }) => ({ ...rest, avg_latency_ms: avg(latencies) }))
    .sort((a, b) => b.calls - a.calls);

  // ---- API traffic ----
  const byEndpoint = new Map<string, { requests: number; errors: number; latencies: number[] }>();
  for (const log of logs) {
    const entry = byEndpoint.get(log.endpoint) ?? { requests: 0, errors: 0, latencies: [] };
    entry.requests += 1;
    if (!log.success) entry.errors += 1;
    if (log.latency_ms !== null) entry.latencies.push(Number(log.latency_ms));
    byEndpoint.set(log.endpoint, entry);
  }
  metrics.api = {
    public_requests: logs.length,
    avg_latency_ms: avg(logs.map((l) => Number(l.latency_ms ?? NaN))),
    error_responses: logs.filter((l) => !l.success).length,
    by_endpoint: [...byEndpoint.entries()]
      .map(([endpoint, v]) => ({
        endpoint,
        requests: v.requests,
        errors: v.errors,
        avg_latency_ms: avg(v.latencies),
      }))
      .sort((a, b) => b.requests - a.requests),
  };

  return metrics;
}
