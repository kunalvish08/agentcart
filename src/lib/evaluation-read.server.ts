// Phase 09 — read models for the Evaluation Lab UI.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildDataset, datasetCategoryCounts, DATASET_VERSION, DATASET_SEED } from "@/lib/evaluation-dataset";
import type { EvaluationMetricsPayload } from "@/lib/evaluation-metrics.server";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type RunSummary = {
  id: string;
  label: string;
  kind: string;
  status: string;
  paused_reason: string | null;
  sample_size: number;
  batch_size: number;
  scenario_count: number;
  dataset_version: string;
  dataset_seed: string;
  prompt_version: string;
  model: string;
  policy_version: string | null;
  catalog_version: string | null;
  created_at: string;
  completed_at: string | null;
  completed_results: number;
  pending_results: number;
  total_results: number;
};

export type ResultRowView = {
  scenario_id: string;
  baseline_type: "traditional" | "agentic" | "safety";
  status: string;
  category: string | null;
  intent: string | null;
  expected_outcome: string | null;
  actual_outcome: string | null;
  outcome_match: boolean | null;
  safely_contained: boolean | null;
  converted: boolean;
  cross_sell: boolean;
  negotiated: boolean;
  approval_required: boolean;
  hallucinated_product: boolean;
  selected_product: string | null;
  gross_amount: number | null;
  discount: number | null;
  final_amount: number | null;
  latency_ms: number | null;
  tool_calls: number;
  failure_reason: string | null;
  agent_run_id: string | null;
  order_id: string | null;
  detail: Record<string, JsonValue> | null;
};

export type LabOverview = {
  dataset: {
    version: string;
    seed: string;
    total: number;
    categories: Array<{ category: string; count: number }>;
  };
  runs: RunSummary[];
};

async function ownedMerchantId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("merchants")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function labOverview(userId: string): Promise<LabOverview> {
  const dataset = buildDataset();
  const counts = datasetCategoryCounts(dataset);
  const merchantId = await ownedMerchantId(userId);

  let runs: RunSummary[] = [];
  if (merchantId) {
    const { data } = await supabaseAdmin
      .from("evaluation_runs")
      .select(
        "id, label, kind, status, paused_reason, sample_size, batch_size, scenario_count, dataset_version, dataset_seed, prompt_version, model, policy_version, catalog_version, created_at, completed_at",
      )
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(20);

    const rows = (data ?? []) as Array<Record<string, any>>;
    runs = await Promise.all(
      rows.map(async (row) => {
        const [{ count: total }, { count: pending }] = await Promise.all([
          supabaseAdmin
            .from("evaluation_results")
            .select("id", { count: "exact", head: true })
            .eq("run_id", row["id"]),
          supabaseAdmin
            .from("evaluation_results")
            .select("id", { count: "exact", head: true })
            .eq("run_id", row["id"])
            .in("status", ["pending", "running"]),
        ]);
        const totalResults = total ?? 0;
        const pendingResults = pending ?? 0;
        return {
          id: row["id"],
          label: row["label"],
          kind: row["kind"],
          status: row["status"],
          paused_reason: row["paused_reason"] ?? null,
          sample_size: row["sample_size"] ?? 0,
          batch_size: row["batch_size"] ?? 0,
          scenario_count: row["scenario_count"] ?? 0,
          dataset_version: row["dataset_version"],
          dataset_seed: row["dataset_seed"],
          prompt_version: row["prompt_version"],
          model: row["model"],
          policy_version: row["policy_version"] ?? null,
          catalog_version: row["catalog_version"] ?? null,
          created_at: row["created_at"],
          completed_at: row["completed_at"] ?? null,
          completed_results: totalResults - pendingResults,
          pending_results: pendingResults,
          total_results: totalResults,
        } satisfies RunSummary;
      }),
    );
  }

  return {
    dataset: {
      version: DATASET_VERSION,
      seed: DATASET_SEED,
      total: dataset.length,
      categories: counts,
    },
    runs,
  };
}

export type RunDetail = {
  run: RunSummary;
  metrics: EvaluationMetricsPayload | null;
  results: ResultRowView[];
};

export async function runDetail(userId: string, runId: string): Promise<RunDetail | null> {
  const merchantId = await ownedMerchantId(userId);
  if (!merchantId) return null;

  const { data: run } = await supabaseAdmin
    .from("evaluation_runs")
    .select(
      "id, merchant_id, label, kind, status, paused_reason, sample_size, batch_size, scenario_count, dataset_version, dataset_seed, prompt_version, model, policy_version, catalog_version, created_at, completed_at",
    )
    .eq("id", runId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!run) return null;

  const [{ data: metricsRow }, { data: resultRows }, { data: scenarioRows }] = await Promise.all([
    supabaseAdmin.from("evaluation_metrics").select("metrics").eq("run_id", runId).maybeSingle(),
    supabaseAdmin
      .from("evaluation_results")
      .select(
        "scenario_id, baseline_type, status, expected_outcome, actual_outcome, outcome_match, safely_contained, converted, cross_sell, negotiated, approval_required, hallucinated_product, selected_product, gross_amount, discount, final_amount, latency_ms, tool_calls, failure_reason, agent_run_id, order_id, detail",
      )
      .eq("run_id", runId)
      .order("scenario_id", { ascending: true }),
    supabaseAdmin
      .from("evaluation_scenarios")
      .select("scenario_id, category, intent")
      .eq("run_id", runId)
      .eq("in_sample", true),
  ]);

  const meta = new Map(
    ((scenarioRows ?? []) as Array<{ scenario_id: string; category: string; intent: string }>).map((r) => [
      r.scenario_id,
      r,
    ]),
  );

  const rows = ((resultRows ?? []) as Array<Record<string, any>>).map((row) => {
    const info = meta.get(row["scenario_id"]);
    return {
      ...(row as unknown as ResultRowView),
      category: info?.category ?? null,
      intent: info?.intent ?? null,
    } satisfies ResultRowView;
  });

  const total = rows.length;
  const pending = rows.filter((r) => r.status === "pending" || r.status === "running").length;

  return {
    run: {
      id: run["id"],
      label: run["label"],
      kind: run["kind"],
      status: run["status"],
      paused_reason: run["paused_reason"] ?? null,
      sample_size: run["sample_size"] ?? 0,
      batch_size: run["batch_size"] ?? 0,
      scenario_count: run["scenario_count"] ?? 0,
      dataset_version: run["dataset_version"],
      dataset_seed: run["dataset_seed"],
      prompt_version: run["prompt_version"],
      model: run["model"],
      policy_version: run["policy_version"] ?? null,
      catalog_version: run["catalog_version"] ?? null,
      created_at: run["created_at"],
      completed_at: run["completed_at"] ?? null,
      completed_results: total - pending,
      pending_results: pending,
      total_results: total,
    },
    metrics: (metricsRow?.metrics as EvaluationMetricsPayload | undefined) ?? null,
    results: rows,
  };
}
