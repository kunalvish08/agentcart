// Phase 09 — AGENTIC arm of the A/B evaluation.
//
// This does NOT reimplement the agent. It drives the Phase 08 external buyer
// runner (`runExternalBuyer`) exactly as the Buyer Lab does — same model, same
// prompt, same public API, same limits — and translates the run's emitted events
// into the same measurement shape the traditional baseline produces, so both arms
// are scored by identical rules.
import { runExternalBuyer, type BuyerState, type ExternalBuyerEvent } from "@/lib/external-buyer.server";
import type { ApiCall } from "@/lib/agent-commerce-client.server";
import type { EvaluationScenario } from "@/lib/evaluation-dataset";
import type { BaselineAttempt } from "@/lib/evaluation-traditional.server";

export type AgenticAttempt = BaselineAttempt & {
  agent_run_id: string | null;
  agent_session_id: string | null;
  final_text: string;
  stop_reason: string;
  steps: number;
  quoted_products: string[];
  unsupported_amounts: number[];
  notice: string | null;
};

/** Pulls every ₹/number-shaped money figure out of the agent's closing message. */
function claimedAmounts(text: string): number[] {
  const found: number[] = [];
  const re = /₹\s?([\d,]+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = Number((m[1] ?? "").replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) found.push(value);
  }
  return found;
}

/** Every money figure the SERVER actually returned during the run. */
function serverAmounts(state: BuyerState, quotes: Array<{ final_amount: number }>): Set<number> {
  const set = new Set<number>();
  const add = (n: unknown) => {
    const value = Number(n);
    if (Number.isFinite(value) && value > 0) set.add(Math.round(value * 100) / 100);
  };
  for (const c of state.candidates) add(c.price);
  add(state.selected_product?.price);
  add(state.quote?.final_amount);
  add(state.negotiation?.final_amount);
  add(state.checkout?.final_amount);
  add(state.manifest?.max_order_value);
  add(state.manifest?.approval_required_above);
  for (const q of quotes) add(q.final_amount);
  return set;
}

export async function runAgenticArm(args: {
  scenario: EvaluationScenario;
  userId: string;
  baseUrl: string;
  accessoryNames: Set<string>;
  signal: AbortSignal;
}): Promise<AgenticAttempt> {
  const { scenario, userId, baseUrl, accessoryNames, signal } = args;
  const startedAt = Date.now();

  const apiCalls: ApiCall[] = [];
  const quotes: Array<{ quote_id: string; product_name: string; final_amount: number }> = [];
  let text = "";
  let runId: string | null = null;
  let sessionId: string | null = null;
  let finalState: BuyerState | null = null;
  let stopReason = "unknown";
  let steps = 0;
  let toolCalls = 0;
  let notice: string | null = null;

  const onEvent = (event: ExternalBuyerEvent) => {
    switch (event.type) {
      case "session":
        runId = event.run_id;
        sessionId = event.session_id;
        break;
      case "api_call":
        apiCalls.push(event.call);
        break;
      case "text":
        text += event.delta;
        break;
      case "state": {
        const quote = event.state.quote;
        if (quote && !quotes.some((q) => q.quote_id === quote.quote_id)) {
          quotes.push({
            quote_id: quote.quote_id,
            product_name: quote.product_name,
            final_amount: quote.final_amount,
          });
        }
        finalState = event.state;
        break;
      }
      case "notice":
        notice = notice ?? `${event.code}: ${event.message}`;
        break;
      case "done":
        finalState = event.state;
        stopReason = event.stop_reason;
        steps = event.step_count;
        toolCalls = event.tool_call_count;
        break;
      default:
        break;
    }
  };

  let runError: string | null = null;
  try {
    await runExternalBuyer({
      userId,
      message: scenario.intent,
      scenarioId: scenario.scenario_id,
      baseUrl,
      emit: onEvent,
      signal,
    });
  } catch (error) {
    runError = error instanceof Error ? error.message : String(error);
  }

  const state: BuyerState =
    finalState ??
    ({
      manifest: null,
      candidates: [],
      selected_product: null,
      quote: null,
      negotiation: null,
      checkout: null,
      no_match: false,
    } as BuyerState);

  const checkout = state.checkout;
  const converted = Boolean(checkout?.accepted && checkout?.order_id);
  const approvalRequired = Boolean(checkout?.approval_required) || checkout?.status === "APPROVAL_REQUIRED";

  const primaryQuote = state.quote;
  const discountPercent = state.negotiation
    ? state.negotiation.approved_discount_percent
    : (primaryQuote?.allowed_discount_percent ?? 0);
  const finalAmount = checkout?.final_amount ?? primaryQuote?.final_amount ?? null;
  const grossAmount =
    state.selected_product && primaryQuote
      ? Math.round(state.selected_product.price * primaryQuote.quantity * 100) / 100
      : finalAmount;
  const discountAmount =
    grossAmount !== null && finalAmount !== null ? Math.round((grossAmount - finalAmount) * 100) / 100 : null;

  const quotedProducts = quotes.map((q) => q.product_name);
  const accessoryQuoted = quotedProducts.some((name) => accessoryNames.has(name));
  const nonAccessoryQuoted = quotedProducts.some((name) => !accessoryNames.has(name));
  const crossSell = accessoryQuoted && (nonAccessoryQuoted || quotedProducts.length > 1);
  const crossSellAmount = crossSell
    ? (quotes.find((q) => accessoryNames.has(q.product_name))?.final_amount ?? null)
    : null;

  const allowed = serverAmounts(state, quotes);
  const unsupported = claimedAmounts(text).filter(
    (value) => ![...allowed].some((ok) => Math.abs(ok - value) < 1),
  );

  let actualOutcome: string;
  let failureReason: string | null = null;
  if (runError) {
    actualOutcome = "harness_error";
    failureReason = runError;
  } else if (converted) {
    actualOutcome = approvalRequired ? "approval_required" : "converted";
  } else if (checkout?.error) {
    const code = checkout.error.code;
    actualOutcome =
      code === "insufficient_inventory"
        ? "inventory_rejected"
        : code === "order_value_exceeded"
          ? "order_limit_rejected"
          : `checkout_rejected:${code}`;
    failureReason = checkout.error.message;
  } else if (state.no_match) {
    actualOutcome = "no_match";
    failureReason = "agent reported no matching product";
  } else {
    const inventoryCall = apiCalls.find((c) => c.status === 409 && /quote/.test(c.path));
    if (inventoryCall) {
      actualOutcome = "quote_rejected:policy";
      failureReason = "server refused the quote";
    } else if (primaryQuote) {
      actualOutcome = "abandoned_after_quote";
      failureReason = "agent produced a quote but never requested checkout";
    } else {
      actualOutcome = "abandoned";
      failureReason = notice ?? `agent stopped without a quote (${stopReason})`;
    }
  }

  return {
    converted,
    selected_product: state.selected_product?.name ?? primaryQuote?.product_name ?? null,
    selected_product_id: state.selected_product?.product_id ?? null,
    gross_amount: grossAmount,
    discount: discountAmount,
    final_amount: finalAmount,
    currency: checkout?.currency ?? primaryQuote?.currency ?? state.manifest?.currency ?? null,
    quote_issued: Boolean(primaryQuote),
    negotiated: Boolean(state.negotiation),
    approval_required: approvalRequired,
    cross_sell: crossSell,
    cross_sell_amount: crossSellAmount,
    policy_result: state.negotiation?.decision ?? primaryQuote?.policy_reason ?? checkout?.error?.code ?? null,
    actual_outcome: actualOutcome,
    failure_reason: failureReason,
    hallucinated_product: unsupported.length > 0,
    api_calls: apiCalls,
    order_id: checkout?.order_id ?? null,
    latency_ms: Date.now() - startedAt,
    tool_calls: toolCalls,
    detail: {
      stop_reason: stopReason,
      steps,
      quoted_products: quotedProducts,
      discount_percent: discountPercent,
      policy_limit_percent: state.manifest?.max_discount_percent ?? null,
      unsupported_amounts: unsupported,
    },
    agent_run_id: runId,
    agent_session_id: sessionId,
    final_text: text.trim().slice(0, 4000),
    stop_reason: stopReason,
    steps,
    quoted_products: quotedProducts,
    unsupported_amounts: unsupported,
    notice: notice ?? runError,
  };
}
