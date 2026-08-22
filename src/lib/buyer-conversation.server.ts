// State hydration — rebuilds the AI Buyer conversation from persisted rows.
//
// The database is the single source of truth: turns, activity traces, the
// recommendation card, growth picks and checkout state are all replayed from
// agent_sessions / agent_runs / agent_steps / tool_calls / growth_recommendations
// / orders. Nothing here invents a value that the server did not already store.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { buildRecommendation, collectObservations, createObserved } from "@/lib/agent-runner.server";

type Client = SupabaseClient<Database>;

export type PersistedTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps: Array<{
    step_number: number;
    step_type: string;
    status: string;
    label: string;
    latency_ms?: number;
    tool_name?: string;
  }>;
  recommendation: any | null;
  notices: Array<{ code: string; message: string }>;
  meta: any;

};

export type PersistedConversation = {
  session_id: string | null;
  turns: PersistedTurn[];
};

export async function loadBuyerConversation(
  supabase: Client,
  userId: string,
): Promise<PersistedConversation> {
  const { data: session } = await supabase
    .from("agent_sessions")
    .select("id")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return { session_id: null, turns: [] };

  const [{ data: runs }, { data: growthRows }, { data: orders }] = await Promise.all([
    supabase
      .from("agent_runs")
      .select(
        "id, user_request, model, status, duration_ms, step_count, tool_call_count, total_tokens, gateway_run_id, stop_reason, error, started_at",
      )
      .eq("session_id", session.id)
      .order("started_at", { ascending: true }),
    supabase
      .from("growth_recommendations")
      .select("id, accepted, recommended_product_id")
      .eq("buyer_session_id", session.id),
    supabase
      .from("orders")
      .select(
        "id, quote_id, status, currency, subtotal_amount, discount_amount, final_amount, approval_required, approval_reason, order_items(quantity, products(name))",
      )
      .eq("buyer_session_id", session.id)
      .order("created_at", { ascending: true }),
  ]);

  const runList = runs ?? [];
  if (runList.length === 0) return { session_id: session.id, turns: [] };

  const runIds = runList.map((r) => r.id);
  const [{ data: steps }, { data: calls }] = await Promise.all([
    supabase
      .from("agent_steps")
      .select("id, run_id, step_number, step_type, status, input_summary, output_summary, latency_ms")
      .in("run_id", runIds)
      .order("step_number", { ascending: true }),
    supabase
      .from("tool_calls")
      .select("id, run_id, step_id, tool_name, status, output_json")
      .in("run_id", runIds),
  ]);

  const acceptedById = new Map((growthRows ?? []).map((g) => [g.id, g.accepted]));
  const turns: PersistedTurn[] = [];

  for (const run of runList) {
    const runSteps = (steps ?? []).filter((s) => s.run_id === run.id);
    const runCalls = (calls ?? []).filter((c) => c.run_id === run.id);
    const toolByStep = new Map(runCalls.map((c) => [c.step_id ?? "", c.tool_name]));

    // Replay persisted tool outputs through the same deterministic builder the
    // live runner uses, so the rebuilt card matches what was shown originally.
    const observed = createObserved();
    for (const call of runCalls) {
      const ok = call.status === "success";
      collectObservations(
        call.tool_name,
        ok
          ? { ok: true, data: call.output_json as unknown }
          : {
              ok: false,
              error: {
                code: String((call.output_json as Record<string, unknown> | null)?.["code"] ?? "error"),
                message: String(
                  (call.output_json as Record<string, unknown> | null)?.["message"] ??
                    "The tool call failed.",
                ),
              },
            },
        observed,
      );
    }
    const recommendation = buildRecommendation(observed) as Record<string, any> | null;

    if (recommendation) {
      // Growth picks carry their persisted accept/reject decision.
      recommendation["growth"] = (recommendation["growth"] ?? []).map((pick: Record<string, any>) => {
        const id = pick["recommendation_id"] as string | null;
        return id && acceptedById.has(id) ? { ...pick, accepted: acceptedById.get(id) } : pick;
      });

      // Checkout state comes from the order row, not from client memory.
      const quote = recommendation["quote"]?.quote ?? recommendation["quote"] ?? null;
      const quoteId = quote?.quote_id ?? null;
      const order =
        (orders ?? []).find((o) => quoteId && o.quote_id === quoteId) ??
        (recommendation["checkout"]?.order?.order_id
          ? (orders ?? []).find((o) => o.id === recommendation["checkout"].order.order_id)
          : undefined);
      if (order) {
        const item = (order.order_items ?? [])[0] as Record<string, any> | undefined;
        recommendation["checkout"] = {
          checkout_created: true,
          order: {
            order_id: order.id,
            status: order.status,
            currency: order.currency,
            subtotal_amount: Number(order.subtotal_amount),
            discount_amount: Number(order.discount_amount),
            final_amount: Number(order.final_amount),
            approval_required: order.approval_required,
            approval_reason: order.approval_reason,
            quantity: Number(item?.["quantity"] ?? 0),
            product_name: (item?.["products"] as { name?: string } | null)?.name ?? null,
          },
        };
      }
    }

    const answer = [...runSteps].reverse().find((s) => s.step_type === "model_answer");

    if (run.user_request) {
      turns.push({
        id: `${run.id}-user`,
        role: "user",
        content: run.user_request,
        steps: [],
        notices: [],
        recommendation: null,
        meta: {},
      });
    }

    turns.push({
      id: `${run.id}-assistant`,
      role: "assistant",
      content: answer?.output_summary ?? "",
      steps: runSteps.map((s) => ({
        step_number: s.step_number,
        step_type: s.step_type,
        status: s.status,
        label: s.input_summary ?? s.step_type,
        ...(s.latency_ms !== null ? { latency_ms: Number(s.latency_ms) } : {}),
        ...(toolByStep.get(s.id) ? { tool_name: toolByStep.get(s.id) as string } : {}),
      })),
      recommendation,
      notices: run.error ? [{ code: run.stop_reason ?? "agent_error", message: run.error }] : [],
      meta: {
        model: run.model,
        duration_ms: run.duration_ms,
        step_count: run.step_count,
        tool_call_count: run.tool_call_count,
        total_tokens: run.total_tokens,
        gateway_run_id: run.gateway_run_id,
        stop_reason: run.stop_reason,
        status: run.status,
      },
    });
  }

  return { session_id: session.id, turns };
}
