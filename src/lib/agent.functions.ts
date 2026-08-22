import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RecommendationResponse = {
  action: "accepted" | "rejected";
  recommendation_type: "upsell" | "cross_sell";
  quote: {
    quote_id: string;
    product_name: string;
    quantity: number;
    currency: string;
    unit_price: number;
    final_amount: number;
    expires_at: string;
  } | null;
  quote_error: { code: string; message: string } | null;
  pricing_authority: "server";
};

/**
 * Buyer accepts or rejects a Revenue Agent recommendation.
 * The AI has no authority here: the recommendation row is re-read under RLS,
 * merchant policy is re-checked and every amount comes from the server quote API.
 */
export const respondToRecommendation = createServerFn({ method: "POST" })
  .inputValidator((data: { recommendationId: string; action: "accept" | "reject" }) =>
    z
      .object({
        recommendationId: z.string().uuid(),
        action: z.enum(["accept", "reject"]),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<RecommendationResponse> => {
    const { data: rec, error: recError } = await context.supabase
      .from("growth_recommendations")
      .select(
        "id, merchant_id, buyer_session_id, source_product_id, recommended_product_id, recommendation_type, reason, currency",
      )
      .eq("id", data.recommendationId)
      .maybeSingle();
    if (recError) throw new Error(recError.message);
    if (!rec) throw new Error("Recommendation not found");

    const type = rec.recommendation_type as "upsell" | "cross_sell";
    const { recordRevenueEvent } = await import("@/lib/revenue.server");

    if (data.action === "reject") {
      await recordRevenueEvent({
        merchantId: rec.merchant_id,
        event: "RECOMMENDATION_REJECTED",
        buyerSessionId: rec.buyer_session_id,
        recommendationId: rec.id,
        sourceProductId: rec.source_product_id,
        productId: rec.recommended_product_id,
        recommendationType: type,
        currency: rec.currency,
      });
      return {
        action: "rejected",
        recommendation_type: type,
        quote: null,
        quote_error: null,
        pricing_authority: "server",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPolicy } = await import("@/lib/public-api.server");
    const policy = await getPolicy(rec.merchant_id);
    if (type === "upsell" && !policy.allow_upsell) {
      throw new Error("Upselling is disabled by merchant policy");
    }

    const { data: merchant } = await supabaseAdmin
      .from("merchants")
      .select("slug")
      .eq("id", rec.merchant_id)
      .maybeSingle();

    const { getRequest } = await import("@tanstack/react-start/server");
    const { requestServerQuote } = await import("@/lib/negotiation.server");
    const outcome = await requestServerQuote({
      baseUrl: new URL(getRequest().url).origin,
      merchantSlug: merchant?.slug ?? "technova-store",
      productId: rec.recommended_product_id,
      quantity: 1,
      discountPercent: 0,
    });

    const { error } = await context.supabase
      .from("growth_recommendations")
      .update({ accepted: true, accepted_at: new Date().toISOString() })
      .eq("id", rec.id);
    if (error) throw new Error(error.message);

    for (const event of [
      "RECOMMENDATION_ACCEPTED",
      type === "upsell" ? "UPSELL_ACCEPTED" : "CROSS_SELL_ACCEPTED",
    ] as const) {
      await recordRevenueEvent({
        merchantId: rec.merchant_id,
        event,
        buyerSessionId: rec.buyer_session_id,
        recommendationId: rec.id,
        sourceProductId: rec.source_product_id,
        productId: rec.recommended_product_id,
        recommendationType: type,
        amount: outcome.ok ? Number(outcome.quote.final_amount ?? 0) : 0,
        currency: rec.currency,
        reason: rec.reason,
        detail: outcome.ok
          ? { quote_id: outcome.quote.quote_id, pricing_authority: "server" }
          : { quote_error: outcome.error.code },
      });
    }

    return {
      action: "accepted",
      recommendation_type: type,
      quote: outcome.ok
        ? {
            quote_id: outcome.quote.quote_id,
            product_name: outcome.quote.product_name,
            quantity: Number(outcome.quote.quantity ?? 1),
            currency: String(outcome.quote.currency ?? rec.currency),
            unit_price: Number(outcome.quote.unit_price ?? 0),
            final_amount: Number(outcome.quote.final_amount ?? 0),
            expires_at: String(outcome.quote.expires_at ?? ""),
          }
        : null,
      quote_error: outcome.ok ? null : outcome.error,
      pricing_authority: "server",
    };
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
