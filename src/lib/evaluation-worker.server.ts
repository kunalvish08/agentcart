// Phase 09 — batch evaluation engine.
//
// Runs are persisted, chunked and resumable. Nothing runs on a page view: the UI
// asks for the next chunk, and each chunk is guarded by a database lease so two
// callers (two tabs, a retry, a double click) cannot process the same run twice.
//
// Hard rules encoded here:
//   * bounded work per invocation (batch size, capped)
//   * single-flight lease in `evaluation_job_locks`
//   * idempotent progress: each scenario/baseline row is claimed before work and
//     written in the same step, so a resumed run never redoes finished work
//   * circuit breaker: AI credit/rate-limit/config failures pause the whole run
//     and surface the reason to the merchant instead of burning credits
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AgentCommerceClient } from "@/lib/agent-commerce-client.server";
import { buildDataset, DATASET_VERSION, DATASET_SEED, PROMPT_VERSION } from "@/lib/evaluation-dataset";
import type { EvaluationScenario } from "@/lib/evaluation-dataset";
import { gradeOutcome } from "@/lib/evaluation-grading";
import { runTraditionalBaseline, type BaselineAttempt } from "@/lib/evaluation-traditional.server";
import { runAgenticArm } from "@/lib/evaluation-agentic.server";
import { mintAgentSessionToken } from "@/lib/agent-session-token.server";
import { computeEvaluationMetrics } from "@/lib/evaluation-metrics.server";

export const MAX_BATCH_SIZE = 25;
export const DEFAULT_BATCH_SIZE = 20;
const LOCK_TTL_MS = 5 * 60_000;
export const EVAL_MODEL = "google/gemini-3.7-flash";

type MerchantRow = { id: string; slug: string | null; name: string; currency: string };

/** Text that means "stop the whole run": credits, policy, config, rate limits. */
function breakerReason(text: string | null | undefined): string | null {
  if (!text) return null;
  if (/credits are exhausted|payment required/i.test(text)) return "AI credits are exhausted.";
  if (/not configured|unauthorized|invalid api key/i.test(text)) return "AI access is not configured.";
  if (/rate limited|too many requests/i.test(text)) return "The AI model is rate limited.";
  return null;
}

async function resolveMerchantForUser(userId: string): Promise<MerchantRow | null> {
  const { data } = await supabaseAdmin
    .from("merchants")
    .select("id, slug, name, currency")
    .eq("owner_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as MerchantRow | null) ?? null;
}

async function accessoryNameSet(merchantId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("products")
    .select("name, category")
    .eq("merchant_id", merchantId);
  const set = new Set<string>();
  for (const row of (data ?? []) as Array<{ name: string; category: string | null }>) {
    if ((row.category ?? "").toLowerCase().includes("accessor")) set.add(row.name);
  }
  return set;
}

/* ------------------------------- run creation ------------------------------ */

export async function createEvaluationRun(args: {
  userId: string;
  label: string;
  sampleSize: number;
  batchSize: number;
  includeSafety: boolean;
  notes?: string | null;
}) {
  const merchant = await resolveMerchantForUser(args.userId);
  if (!merchant) return { ok: false as const, error: "No active merchant found for this account." };

  const dataset = buildDataset();
  const sampleSize = Math.max(1, Math.min(args.sampleSize, dataset.length));
  const batchSize = Math.max(1, Math.min(args.batchSize || DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE));

  const [{ data: policy }, { data: products }] = await Promise.all([
    supabaseAdmin
      .from("merchant_policies")
      .select("max_discount_percent, max_order_value, approval_required_above, allow_negotiation, allow_upsell")
      .eq("merchant_id", merchant.id)
      .maybeSingle(),
    supabaseAdmin
      .from("products")
      .select("id, name, price, stock_quantity, category, status")
      .eq("merchant_id", merchant.id)
      .order("price", { ascending: false }),
  ]);

  const { data: run, error: runError } = await supabaseAdmin
    .from("evaluation_runs")
    .insert({
      merchant_id: merchant.id,
      created_by: args.userId,
      label: args.label.slice(0, 120),
      kind: "live",
      dataset_version: DATASET_VERSION,
      dataset_seed: DATASET_SEED,
      prompt_version: PROMPT_VERSION,
      model: EVAL_MODEL,
      model_config: { temperature: 0.2, max_steps: 8, max_tool_calls: 14 },
      scenario_count: dataset.length,
      sample_size: sampleSize,
      batch_size: batchSize,
      status: "queued",
      notes: args.notes ?? null,
      policy_snapshot: policy ?? {},
      catalog_snapshot: { products: products ?? [] },
      policy_version: policy
        ? `d${policy.max_discount_percent}-o${policy.max_order_value}-a${policy.approval_required_above}`
        : null,
      catalog_version: `p${(products ?? []).length}`,
      synthetic: true,
    })
    .select("id")
    .single();
  if (runError || !run) return { ok: false as const, error: runError?.message ?? "Could not create run." };

  const scenarioRows = dataset.map((scenario, index) => ({
    run_id: run.id,
    scenario_id: scenario.scenario_id,
    sequence: index + 1,
    category: scenario.category,
    intent: scenario.intent,
    budget: scenario.budget,
    target_category: scenario.target_category,
    target_product: scenario.target_product,
    quantity: scenario.quantity,
    discount_request: scenario.discount_request,
    expected_outcome: scenario.expected_outcome,
    difficulty: scenario.difficulty,
    in_sample: index < sampleSize,
  }));

  for (let i = 0; i < scenarioRows.length; i += 200) {
    const { error } = await supabaseAdmin.from("evaluation_scenarios").insert(scenarioRows.slice(i, i + 200));
    if (error) return { ok: false as const, error: error.message };
  }

  const { data: inserted } = await supabaseAdmin
    .from("evaluation_scenarios")
    .select("id, scenario_id, expected_outcome")
    .eq("run_id", run.id)
    .eq("in_sample", true);

  const pending = ((inserted ?? []) as Array<{ id: string; scenario_id: string; expected_outcome: string }>)
    .flatMap((row) =>
      (["traditional", "agentic"] as const).map((baseline) => ({
        run_id: run.id,
        scenario_row_id: row.id,
        scenario_id: row.scenario_id,
        baseline_type: baseline,
        status: "pending" as const,
        expected_outcome: row.expected_outcome,
      })),
    );

  if (args.includeSafety) {
    for (const probe of SAFETY_PROBES) {
      pending.push({
        run_id: run.id,
        scenario_row_id: null as unknown as string,
        scenario_id: probe.id,
        baseline_type: "safety" as never,
        status: "pending" as const,
        expected_outcome: probe.expected,
      });
    }
  }

  for (let i = 0; i < pending.length; i += 200) {
    const { error } = await supabaseAdmin.from("evaluation_results").insert(pending.slice(i, i + 200));
    if (error) return { ok: false as const, error: error.message };
  }

  return { ok: true as const, run_id: run.id as string, sample_size: sampleSize, batch_size: batchSize };
}

/* ------------------------------ locking ------------------------------------ */

async function acquireLock(runId: string, holder: string) {
  const nowIso = new Date().toISOString();
  const lockKey = `evaluation:${runId}`;
  await supabaseAdmin.from("evaluation_job_locks").delete().eq("lock_key", lockKey).lt("expires_at", nowIso);
  const { error } = await supabaseAdmin.from("evaluation_job_locks").insert({
    lock_key: lockKey,
    run_id: runId,
    holder,
    expires_at: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
  });
  return { acquired: !error, lockKey };
}

async function releaseLock(lockKey: string, holder: string) {
  await supabaseAdmin.from("evaluation_job_locks").delete().eq("lock_key", lockKey).eq("holder", holder);
}

/* ------------------------------ safety probes ------------------------------ */

export const SAFETY_PROBES = [
  {
    id: "safety-over-cap-discount",
    title: "Discount far above the policy cap",
    expected: "policy_capped_discount",
    detail: "Ask for a 60% discount and confirm the server caps it at the merchant's limit.",
  },
  {
    id: "safety-order-value-limit",
    title: "Order above the maximum order value",
    expected: "order_limit_rejected",
    detail: "Quote a quantity whose total exceeds max_order_value and confirm refusal.",
  },
  {
    id: "safety-inventory-overshoot",
    title: "Quantity beyond available stock",
    expected: "inventory_rejected",
    detail: "Request more units than exist and confirm the server refuses.",
  },
  {
    id: "safety-unauthenticated-checkout",
    title: "Checkout without a buyer session token",
    expected: "unauthenticated_rejected",
    detail: "Call /api/public/checkout with no X-Agent-Session header.",
  },
  {
    id: "safety-tampered-token",
    title: "Checkout with a tampered session token",
    expected: "unauthenticated_rejected",
    detail: "Flip a byte in the signed token and confirm the signature check fails.",
  },
  {
    id: "safety-duplicate-idempotency",
    title: "Duplicate checkout with the same idempotency key",
    expected: "idempotent_replay",
    detail: "Replay a checkout and confirm the same order is returned, not a second one.",
  },
] as const;

type SafetyOutcome = {
  passed: boolean;
  actual: string;
  evidence: string;
  calls: number;
  latency_ms: number;
};

async function runSafetyProbe(args: {
  probeId: string;
  baseUrl: string;
  merchant: MerchantRow;
  userId: string;
  policy: { max_discount_percent: number; max_order_value: number };
  runId: string;
}): Promise<SafetyOutcome> {
  const started = Date.now();
  const { probeId, baseUrl, merchant, policy } = args;

  const { data: sessionRow } = await supabaseAdmin
    .from("agent_sessions")
    .insert({
      user_id: args.userId,
      merchant_id: merchant.id,
      title: `EVAL_SAFETY ${probeId}`,
      status: "running",
    })
    .select("id")
    .single();
  const sessionId = sessionRow?.id as string | undefined;
  const token = sessionId ? (await mintAgentSessionToken(sessionId)).token : undefined;

  const client = new AgentCommerceClient({
    baseUrl,
    ...(merchant.slug ? { merchantSlug: merchant.slug } : {}),
    ...(token ? { sessionToken: token } : {}),
  });

  const catalog = await client.browseCatalog({ limit: 20 });
  const products = (((catalog.ok ? (catalog.data as Record<string, any>) : {})["products"] ?? []) as Array<
    Record<string, any>
  >).map((p) => ({
    product_id: String(p["product_id"]),
    name: String(p["name"]),
    price: Number(p["price"]),
    in_stock: Boolean(p["in_stock"]),
  }));
  const top = [...products].sort((a, b) => b.price - a.price)[0];

  const finish = (passed: boolean, actual: string, evidence: string): SafetyOutcome => ({
    passed,
    actual,
    evidence,
    calls: client.calls.length,
    latency_ms: Date.now() - started,
  });

  if (!top) return finish(false, "api_error", "Catalog returned no products.");

  if (probeId === "safety-over-cap-discount") {
    const quote = await client.getQuote({
      product_id: top.product_id,
      quantity: 1,
      requested_discount_percent: 60,
    });
    if (!quote.ok) return finish(false, `quote_rejected:${quote.error.code}`, quote.error.message);
    const applied = Number((quote.data as Record<string, any>)["allowed_discount_percent"] ?? 0);
    const capped = applied <= policy.max_discount_percent + 0.001;
    return finish(
      capped,
      capped ? "policy_capped_discount" : "policy_violation",
      `requested 60% · policy cap ${policy.max_discount_percent}% · server applied ${applied}%`,
    );
  }

  if (probeId === "safety-order-value-limit") {
    const quantity = Math.max(2, Math.ceil(policy.max_order_value / Math.max(top.price, 1)) + 1);
    const quote = await client.getQuote({ product_id: top.product_id, quantity });
    const code = quote.ok ? "accepted" : quote.error.code;
    const passed = !quote.ok && (code === "order_value_exceeded" || code === "insufficient_inventory");
    return finish(
      passed,
      passed ? (code === "order_value_exceeded" ? "order_limit_rejected" : "inventory_rejected") : "policy_violation",
      `${quantity} × ${top.name} · server responded "${code}"`,
    );
  }

  if (probeId === "safety-inventory-overshoot") {
    const quote = await client.getQuote({ product_id: top.product_id, quantity: 9999 });
    const code = quote.ok ? "accepted" : quote.error.code;
    const passed = !quote.ok && (code === "insufficient_inventory" || code === "order_value_exceeded");
    return finish(
      passed,
      passed ? (code === "insufficient_inventory" ? "inventory_rejected" : "order_limit_rejected") : "policy_violation",
      `9999 × ${top.name} · server responded "${code}"`,
    );
  }

  if (probeId === "safety-unauthenticated-checkout" || probeId === "safety-tampered-token") {
    const quote = await client.getQuote({ product_id: top.product_id, quantity: 1 });
    if (!quote.ok) return finish(false, `quote_rejected:${quote.error.code}`, quote.error.message);
    const quoteId = String((quote.data as Record<string, any>)["quote_id"]);

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (probeId === "safety-tampered-token" && token) {
      const parts = token.split(".");
      const sig = parts[3] ?? "";
      parts[3] = `${sig.slice(0, -1)}${sig.slice(-1) === "A" ? "B" : "A"}`;
      headers["x-agent-session"] = parts.join(".");
    }
    const response = await fetch(new URL("/api/public/checkout", baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        quote_id: quoteId,
        idempotency_key: `${args.runId}:${probeId}`,
      }),
    });
    const passed = response.status === 401;
    return finish(
      passed,
      passed ? "unauthenticated_rejected" : "auth_bypass",
      `POST /api/public/checkout returned ${response.status}`,
    );
  }

  // safety-duplicate-idempotency
  const affordable = [...products]
    .filter((p) => p.in_stock && p.price > 0 && p.price <= policy.max_order_value)
    .sort((a, b) => a.price - b.price)[0];
  if (!affordable) return finish(false, "api_error", "No affordable in-stock product to test with.");
  const quote = await client.getQuote({ product_id: affordable.product_id, quantity: 1 });
  if (!quote.ok) return finish(false, `quote_rejected:${quote.error.code}`, quote.error.message);
  const key = `${args.runId}:${probeId}`;
  const first = await client.requestCheckout({
    quote_id: String((quote.data as Record<string, any>)["quote_id"]),
    idempotency_key: key,
    buyer_note: "safety probe: duplicate checkout",
  });
  if (!first.ok) return finish(false, `checkout_rejected:${first.error.code}`, first.error.message);
  const firstOrder = String(((first.data as Record<string, any>)["order"] ?? {})["order_id"]);
  const second = await client.requestCheckout({
    quote_id: String((quote.data as Record<string, any>)["quote_id"]),
    idempotency_key: key,
    buyer_note: "safety probe: duplicate checkout",
  });
  if (!second.ok) return finish(false, `checkout_rejected:${second.error.code}`, second.error.message);
  const secondData = second.data as Record<string, any>;
  const secondOrder = String((secondData["order"] ?? {})["order_id"]);
  const passed = secondOrder === firstOrder && Boolean(secondData["idempotent_replay"]);
  return finish(
    passed,
    passed ? "idempotent_replay" : "duplicate_order_created",
    passed
      ? `replay returned the same order ${firstOrder.slice(0, 8)}…`
      : `first ${firstOrder.slice(0, 8)}… vs second ${secondOrder.slice(0, 8)}…`,
  );
}

/* ------------------------------ batch processing --------------------------- */

type ResultRow = {
  id: string;
  scenario_id: string;
  baseline_type: "traditional" | "agentic" | "safety";
  status: string;
  expected_outcome: string | null;
};

export async function processEvaluationBatch(args: {
  runId: string;
  userId: string;
  baseUrl: string;
  signal: AbortSignal;
}) {
  const holder = crypto.randomUUID();
  const { data: runRow } = await supabaseAdmin
    .from("evaluation_runs")
    .select("id, merchant_id, status, batch_size, sample_size, paused_reason, policy_snapshot")
    .eq("id", args.runId)
    .maybeSingle();
  if (!runRow) return { ok: false as const, error: "Run not found." };

  const merchant = await resolveMerchantForUser(args.userId);
  if (!merchant || merchant.id !== runRow.merchant_id) {
    return { ok: false as const, error: "This run belongs to another merchant." };
  }

  // Paused-state guard: never process work while the breaker is open.
  if (runRow.status === "paused") {
    return {
      ok: true as const,
      status: "paused" as const,
      processed: 0,
      remaining: await countPending(args.runId),
      paused_reason: runRow.paused_reason,
    };
  }
  if (runRow.status === "completed" || runRow.status === "cancelled") {
    return { ok: true as const, status: runRow.status, processed: 0, remaining: 0, paused_reason: null };
  }

  const lock = await acquireLock(args.runId, holder);
  if (!lock.acquired) {
    return {
      ok: true as const,
      status: "running" as const,
      processed: 0,
      remaining: await countPending(args.runId),
      paused_reason: null,
      note: "Another batch is already in flight for this run.",
    };
  }

  try {
    await supabaseAdmin
      .from("evaluation_runs")
      .update({
        status: "running",
        started_at: (runRow as Record<string, any>)["started_at"] ?? new Date().toISOString(),
      })
      .eq("id", args.runId);

    const batchSize = Math.min(runRow.batch_size ?? DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
    const { data: pendingRows } = await supabaseAdmin
      .from("evaluation_results")
      .select("id, scenario_id, baseline_type, status, expected_outcome")
      .eq("run_id", args.runId)
      .in("status", ["pending"])
      .order("scenario_id", { ascending: true })
      .order("baseline_type", { ascending: true })
      .limit(batchSize);

    const rows = (pendingRows ?? []) as ResultRow[];
    if (rows.length === 0) {
      await finalizeRun(args.runId);
      return {
        ok: true as const,
        status: "completed" as const,
        processed: 0,
        remaining: 0,
        paused_reason: null,
      };
    }

    const dataset = buildDataset();
    const byId = new Map(dataset.map((s) => [s.scenario_id, s]));
    const accessories = await accessoryNameSet(merchant.id);
    const policySnapshot = (runRow.policy_snapshot ?? {}) as Record<string, any>;
    const policy = {
      max_discount_percent: Number(policySnapshot["max_discount_percent"] ?? 0),
      max_order_value: Number(policySnapshot["max_order_value"] ?? 0),
    };

    let processed = 0;
    let pauseReason: string | null = null;

    for (const row of rows) {
      if (args.signal.aborted) break;
      if (pauseReason) break;

      // Claim the row first: a resumed run never redoes finished work.
      const { data: claimed } = await supabaseAdmin
        .from("evaluation_results")
        .update({ status: "running" })
        .eq("id", row.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!claimed) continue;

      try {
        if (row.baseline_type === "safety") {
          const probe = SAFETY_PROBES.find((p) => p.id === row.scenario_id);
          const outcome = await runSafetyProbe({
            probeId: row.scenario_id,
            baseUrl: args.baseUrl,
            merchant,
            userId: args.userId,
            policy,
            runId: args.runId,
          });
          await supabaseAdmin
            .from("evaluation_results")
            .update({
              status: "completed",
              actual_outcome: outcome.actual,
              outcome_match: outcome.passed,
              safely_contained: outcome.passed,
              latency_ms: outcome.latency_ms,
              tool_calls: outcome.calls,
              failure_reason: outcome.passed ? null : outcome.evidence,
              detail: { title: probe?.title ?? row.scenario_id, evidence: outcome.evidence, probe: probe?.detail },
            })
            .eq("id", row.id);
          processed += 1;
          continue;
        }

        const scenario = byId.get(row.scenario_id);
        if (!scenario) {
          await supabaseAdmin
            .from("evaluation_results")
            .update({ status: "skipped", failure_reason: "Scenario not present in this dataset version." })
            .eq("id", row.id);
          continue;
        }

        if (row.baseline_type === "traditional") {
          await runAndStoreTraditional({
            resultId: row.id,
            runId: args.runId,
            scenario,
            merchant,
            userId: args.userId,
            baseUrl: args.baseUrl,
            policy,
          });
        } else {
          const attempt = await runAgenticArm({
            scenario,
            userId: args.userId,
            baseUrl: args.baseUrl,
            accessoryNames: accessories,
            signal: args.signal,
          });
          pauseReason = breakerReason(attempt.notice);
          if (pauseReason) {
            // Do not consume this scenario: return it to the queue for a resume.
            await supabaseAdmin
              .from("evaluation_results")
              .update({ status: "pending", failure_reason: attempt.notice })
              .eq("id", row.id);
            break;
          }
          await storeAgentic({ resultId: row.id, scenario, attempt, policy });
        }
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pauseReason = breakerReason(message);
        await supabaseAdmin
          .from("evaluation_results")
          .update({
            status: pauseReason ? "pending" : "failed",
            failure_reason: message.slice(0, 500),
            actual_outcome: pauseReason ? null : "harness_error",
          })
          .eq("id", row.id);
        if (!pauseReason) processed += 1;
      }
    }

    if (pauseReason) {
      await supabaseAdmin
        .from("evaluation_runs")
        .update({ status: "paused", paused_reason: pauseReason })
        .eq("id", args.runId);
    }

    await computeEvaluationMetrics(args.runId);
    const remaining = await countPending(args.runId);
    if (!pauseReason && remaining === 0) await finalizeRun(args.runId);

    return {
      ok: true as const,
      status: pauseReason ? ("paused" as const) : remaining === 0 ? ("completed" as const) : ("running" as const),
      processed,
      remaining,
      paused_reason: pauseReason,
    };
  } finally {
    await releaseLock(lock.lockKey, holder);
  }
}

async function countPending(runId: string) {
  const { count } = await supabaseAdmin
    .from("evaluation_results")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .in("status", ["pending", "running"]);
  return count ?? 0;
}

async function finalizeRun(runId: string) {
  await computeEvaluationMetrics(runId);
  await supabaseAdmin
    .from("evaluation_runs")
    .update({ status: "completed", completed_at: new Date().toISOString(), paused_reason: null })
    .eq("id", runId);
}

/* ------------------------------- arm storage ------------------------------- */

async function runAndStoreTraditional(args: {
  resultId: string;
  runId: string;
  scenario: EvaluationScenario;
  merchant: MerchantRow;
  userId: string;
  baseUrl: string;
  policy: { max_discount_percent: number; max_order_value: number };
}) {
  const { data: sessionRow } = await supabaseAdmin
    .from("agent_sessions")
    .insert({
      user_id: args.userId,
      merchant_id: args.merchant.id,
      title: `EVAL_TRADITIONAL ${args.scenario.scenario_id}`,
      status: "running",
    })
    .select("id")
    .single();
  const sessionId = sessionRow?.id as string | undefined;
  const token = sessionId ? (await mintAgentSessionToken(sessionId)).token : undefined;

  const client = new AgentCommerceClient({
    baseUrl: args.baseUrl,
    ...(args.merchant.slug ? { merchantSlug: args.merchant.slug } : {}),
    ...(token ? { sessionToken: token } : {}),
  });

  const attempt = await runTraditionalBaseline({
    scenario: args.scenario,
    client,
    idempotencyKey: `eval:${args.runId}:${args.scenario.scenario_id}:traditional`,
  });

  if (sessionId) {
    await supabaseAdmin
      .from("agent_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", sessionId);
  }

  const discountPercent =
    attempt.gross_amount && attempt.discount
      ? Math.round((attempt.discount / attempt.gross_amount) * 10000) / 100
      : 0;
  const grade = gradeOutcome(args.scenario, attempt.actual_outcome, {
    approval_required: attempt.approval_required,
    cross_sell: attempt.cross_sell,
    converted: attempt.converted,
    discount_percent: discountPercent,
    policy_limit_percent: args.policy.max_discount_percent,
  });

  await supabaseAdmin
    .from("evaluation_results")
    .update({
      status: "completed",
      ...baseColumns(attempt, args.scenario, grade),
      agent_session_id: sessionId ?? null,
      detail: {
        ...attempt.detail,
        arm: "traditional",
        grade: grade.why,
        api_calls: attempt.api_calls.map((c) => ({
          method: c.method,
          path: c.path,
          status: c.status,
          latency_ms: c.latency_ms,
        })),
      },
    })
    .eq("id", args.resultId);
}

function baseColumns(
  attempt: BaselineAttempt,
  scenario: EvaluationScenario,
  grade: { outcome_match: boolean; safely_contained: boolean },
) {
  return {
    selected_product: attempt.selected_product,
    selected_product_id: attempt.selected_product_id,
    gross_amount: attempt.gross_amount,
    discount: attempt.discount,
    final_amount: attempt.final_amount,
    currency: attempt.currency,
    converted: attempt.converted,
    cross_sell: attempt.cross_sell,
    cross_sell_amount: attempt.cross_sell_amount,
    policy_result: attempt.policy_result,
    expected_outcome: scenario.expected_outcome,
    actual_outcome: attempt.actual_outcome,
    outcome_match: grade.outcome_match,
    safely_contained: grade.safely_contained,
    hallucinated_product: attempt.hallucinated_product,
    approval_required: attempt.approval_required,
    quote_issued: attempt.quote_issued,
    negotiated: attempt.negotiated,
    latency_ms: attempt.latency_ms,
    tool_calls: attempt.tool_calls,
    order_id: attempt.order_id,
    failure_reason: attempt.failure_reason,
  };
}

async function storeAgentic(args: {
  resultId: string;
  scenario: EvaluationScenario;
  attempt: Awaited<ReturnType<typeof runAgenticArm>>;
  policy: { max_discount_percent: number; max_order_value: number };
}) {
  const { attempt, scenario } = args;
  const discountPercent = Number((attempt.detail as Record<string, any>)["discount_percent"] ?? 0);
  const grade = gradeOutcome(scenario, attempt.actual_outcome, {
    approval_required: attempt.approval_required,
    cross_sell: attempt.cross_sell,
    converted: attempt.converted,
    discount_percent: discountPercent,
    policy_limit_percent: args.policy.max_discount_percent,
  });

  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let modelLatency: number | null = null;
  if (attempt.agent_run_id) {
    const { data } = await supabaseAdmin
      .from("agent_runs")
      .select("prompt_tokens, completion_tokens, duration_ms")
      .eq("id", attempt.agent_run_id)
      .maybeSingle();
    promptTokens = (data?.prompt_tokens as number | null) ?? null;
    completionTokens = (data?.completion_tokens as number | null) ?? null;
    modelLatency = (data?.duration_ms as number | null) ?? null;
  }

  await supabaseAdmin
    .from("evaluation_results")
    .update({
      status: attempt.actual_outcome === "harness_error" ? "failed" : "completed",
      ...baseColumns(attempt, scenario, grade),
      agent_run_id: attempt.agent_run_id,
      agent_session_id: attempt.agent_session_id,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      model_latency_ms: modelLatency,
      ai_cost: null, // model price is not published to the app; tokens are recorded instead
      detail: {
        ...attempt.detail,
        arm: "agentic",
        grade: grade.why,
        final_text: attempt.final_text.slice(0, 1200),
        api_calls: attempt.api_calls.map((c) => ({
          method: c.method,
          path: c.path,
          status: c.status,
          latency_ms: c.latency_ms,
        })),
      },
    })
    .eq("id", args.resultId);
}

/* -------------------------------- controls --------------------------------- */

export async function setEvaluationRunStatus(args: {
  runId: string;
  userId: string;
  status: "queued" | "paused" | "cancelled";
}) {
  const merchant = await resolveMerchantForUser(args.userId);
  if (!merchant) return { ok: false as const, error: "No merchant found." };
  const { error } = await supabaseAdmin
    .from("evaluation_runs")
    .update({
      status: args.status,
      paused_reason: args.status === "paused" ? "Paused by the merchant." : null,
    })
    .eq("id", args.runId)
    .eq("merchant_id", merchant.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
