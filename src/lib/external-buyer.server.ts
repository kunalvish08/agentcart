// Phase 08 — bounded EXTERNAL AI buyer agent.
//
// The buyer is modelled as a separate actor: it holds no database handle, no
// merchant credential and no Razorpay credential. Its only capability is the
// six-tool registry, each of which is one public HTTP call to AgentCart.
//
// This harness (not the model) owns control flow: turn/tool budgets, timeouts and
// the observability writes into the existing Phase 03/07 trace tables, so the run
// shows up in Judge Mode alongside internal runs.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AgentCommerceClient, type ApiCall } from "@/lib/agent-commerce-client.server";
import { mintAgentSessionToken } from "@/lib/agent-session-token.server";
import {
  executeExternalTool,
  externalToolSpecs,
  type ExternalToolResult,
} from "@/lib/external-buyer-tools.server";
import { DEFAULT_MERCHANT_SLUG, resolveMerchant } from "@/lib/public-api.server";

export const EXTERNAL_BUYER_MODEL = "external-buyer/google/gemini-3.7-flash";
export const EXTERNAL_RUN_TYPE = "EXTERNAL_AI_BUYER";
export const EXTERNAL_SESSION_PREFIX = "External AI Buyer ·";
export const EXTERNAL_MAX_TURNS = 8;
export const EXTERNAL_MAX_TOOL_CALLS = 14;
const MAX_LOG_CHARS = 3000;

const SYSTEM_PROMPT = `You are an EXTERNAL autonomous buying agent acting for a human shopper. You are NOT part of the merchant's system. Your only access to the merchant (AgentCart) is the six HTTP tools provided; you have no database, no admin access and no payment credentials.

Method you follow:
1. Call discover_merchant first to learn the merchant's capabilities and policy constraints (max discount, approval threshold, currency).
2. Use search_catalog with the shopper's intent and budget. If nothing matches, say so honestly — never invent a product.
3. Call get_product on the best match to confirm its facts.
4. Call get_quote for the authoritative price.
5. If the shopper wants a better price, call negotiate with the percent they want. Report the server's decision exactly: if it counters, state the requested percent, the merchant's policy limit, and the server's final amount.
6. If the shopper wants to buy, call request_checkout with the quote_id the server issued.

Deciding whether to complete the purchase (read carefully):
- The shopper is not available for follow-up questions in this channel. Never end your turn by asking "shall I proceed?" or "let me know and I will order it" — decide from the intent you were given and act.
- PURCHASE INTENT means the shopper is shopping: they name a product, a product type, a category or a budget and want you to obtain it. "I want to buy", "buy", "order", "get me", "purchase", "I need <thing>", "looking for <thing>", "shopping for", "trying to get", "can you find me", "help me pick", and shopping requests that also ask "what do you recommend?" are ALL purchase intent — asking for a recommendation is how a shopper delegates the choice, not a request for a brochure. When the intent is a purchase and the server has issued a quote for an in-stock product that fits any stated budget, you MUST call request_checkout with that quote_id in the SAME run. Ending a purchase run at the quote is a failure to do your job.
- If the shopper also asks for accessories or add-ons "that go with it", call get_quote for the accessory you recommend as well, so every amount you report is server-issued, then check out the main item.
- PURE INFORMATION INTENT is the narrow case where the shopper wants no purchase at all: policy questions, specification comparisons, "is it worth it", "just checking today's price", "does it support X". Only then stop after reporting the server's quote and do NOT check out.

- If checkout is refused (inventory, order-value limit, policy), report the server's error code and stop; never retry with different numbers.

Hard rules you can never break:
- You never calculate, estimate, round or invent any monetary amount, discount, or total. Every number you state must appear verbatim in a tool result from THIS run. If you cannot find a figure in a tool result, do not state a figure — ask for a fresh quote instead.
- You never claim a discount before the server has decided, and you never argue past a policy decision or retry the same rejected percent.
- You cannot approve a checkout, capture or confirm a payment, change an order amount, alter inventory or override policy. If asked, say plainly that only the merchant can approve and that payment happens in the merchant's own flow.
- When checkout returns APPROVAL_REQUIRED, state: "Merchant approval required before payment." Then stop; do not call more tools.
- If a tool fails, report the server's reason plainly and do not substitute your own numbers.
- Never repeat an identical tool call with identical arguments.

Final message format (short, factual, no internal reasoning):
1. One line with the recommended product or an honest no-match statement.
2. "Actions taken" — the API steps you performed.
3. "Outcome" — the server's amount, policy decision and transaction status, quoted from tool results.`;


/* --------------------------------- events ---------------------------------- */

export type ExternalBuyerEvent =
  | {
      type: "session";
      session_id: string;
      run_id: string;
      model: string;
      run_type: string;
      merchant: { slug: string; name: string; currency: string };
    }
  | {
      type: "step";
      step_number: number;
      step_type: string;
      status: string;
      label: string;
      latency_ms?: number;
      tool_name?: string;
      policy_decision?: string;
    }
  | { type: "api_call"; call: ApiCall }
  | { type: "text"; delta: string }
  | { type: "state"; state: BuyerState }
  | { type: "notice"; code: string; message: string }
  /** Every monetary figure the SERVER returned in this run (defence-in-depth #1). */
  | { type: "trusted_amounts"; amounts: number[] }
  /** Validated closing message (defence-in-depth #3). `corrected` = unsafe text replaced. */
  | { type: "final_text"; text: string; corrected: boolean; unsupported_amounts: number[] }

  | {
      type: "done";
      status: string;
      step_count: number;
      tool_call_count: number;
      duration_ms: number;
      stop_reason: string;
      state: BuyerState;
    };

type Emit = (event: ExternalBuyerEvent) => void;

export type BuyerState = {
  manifest: {
    merchant: string;
    currency: string;
    api_version: string | null;
    negotiation_enabled: boolean;
    checkout_enabled: boolean;
    max_discount_percent: number | null;
    approval_required_above: number | null;
    max_order_value: number | null;
  } | null;
  candidates: Array<{
    product_id: string;
    name: string;
    price: number;
    currency: string;
    availability: string;
    in_stock: boolean;
  }>;
  selected_product: { product_id: string; name: string; price: number; currency: string } | null;
  quote: {
    quote_id: string;
    product_name: string;
    quantity: number;
    requested_discount_percent: number;
    allowed_discount_percent: number;
    final_amount: number;
    currency: string;
    requires_merchant_approval: boolean;
    policy_reason: string;
    expires_at: string;
  } | null;
  negotiation: {
    decision: string;
    requested_discount_percent: number;
    policy_limit_percent: number;
    approved_discount_percent: number;
    round_number: number;
    rounds_remaining: number;
    policy_reason: string;
    final_amount: number | null;
  } | null;
  checkout: {
    accepted: boolean;
    order_id: string | null;
    status: string | null;
    final_amount: number | null;
    currency: string | null;
    approval_required: boolean;
    payment_state: string | null;
    next_action: string;
    error: { code: string; message: string } | null;
  } | null;
  no_match: boolean;
};

function emptyState(): BuyerState {
  return {
    manifest: null,
    candidates: [],
    selected_product: null,
    quote: null,
    negotiation: null,
    checkout: null,
    no_match: false,
  };
}

/* ------------------------ trusted monetary provenance ---------------------- */

/**
 * Defence-in-depth against invented prices.
 *
 * 1. Every number the SERVER returned in a successful tool result is recorded
 *    here, keyed to this run only. Nothing the model writes ever enters the set.
 * 2. The system prompt forbids stating a figure that is not in a tool result.
 * 3. The closing message is validated against this ledger before it is reported.
 */
const MONEY_FIELD = /amount|price|total|subtotal|value|paid|payable|limit|threshold/i;

function collectTrustedAmounts(value: unknown, into: Set<number>, keyHint = "") {
  if (value === null || value === undefined) return;
  if (typeof value === "number") {
    if (Number.isFinite(value) && value > 0) into.add(Math.round(value * 100) / 100);
    return;
  }
  if (typeof value === "string") {
    // Numeric strings are how Postgres numerics arrive over JSON.
    if (MONEY_FIELD.test(keyHint) && /^\d+(\.\d+)?$/.test(value.trim())) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) into.add(Math.round(n * 100) / 100);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTrustedAmounts(item, into, keyHint);
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      collectTrustedAmounts(item, into, key);
    }
  }
}

/** Money figures the model stated in prose (₹ or "INR 1,234"). */
export function claimedMonetaryAmounts(text: string): number[] {
  const found: number[] = [];
  const re = /(?:₹|INR|Rs\.?)\s?([\d,]+(?:\.\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = Number((m[1] ?? "").replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) found.push(value);
  }
  return found;
}

/** Claims with no matching server figure (±₹1 tolerance for rounding in prose). */
export function unsupportedMonetaryClaims(text: string, trusted: Set<number>): number[] {
  const allowed = [...trusted];
  return claimedMonetaryAmounts(text).filter(
    (value) => !allowed.some((ok) => Math.abs(ok - value) < 1),
  );
}

const SAFE_REPLACEMENT_TEXT = [
  "I cannot confirm the amounts in my draft answer against the merchant's own API responses, so I am withholding them.",
  "",
  "Outcome: no price is quoted here. Every amount must come from a server-issued quote — please request a fresh quote from the merchant and I will report the server's figures verbatim.",
].join("\n");

/* --------------------------------- helpers --------------------------------- */


function clip(value: unknown): unknown {
  const text = JSON.stringify(value ?? null);
  if (!text) return null;
  if (text.length <= MAX_LOG_CHARS) return JSON.parse(text);
  return { truncated: true, preview: text.slice(0, MAX_LOG_CHARS) };
}

function summarize(value: unknown, max = 300): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ModelTurn = {
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  finishReason: string | null;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
};

async function callModel(
  apiKey: string,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  signal: AbortSignal,
): Promise<ModelTurn> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      messages,
      tools: externalToolSpecs(),
      tool_choice: "auto",
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    let message = "The buyer's AI model is unavailable right now.";
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
      message = parsed.error?.message ?? parsed.message ?? message;
    } catch {
      /* keep default */
    }
    if (response.status === 429) message = "The buyer's AI model is rate limited. Please retry shortly.";
    if (response.status === 402) message = `AI credits are exhausted. ${message}`;
    throw new GatewayError(response.status, message);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let content = "";
  let finishReason: string | null = null;
  let usage: ModelTurn["usage"] = null;
  const partials = new Map<number, { id: string; name: string; arguments: string }>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let chunk: any;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.usage) usage = chunk.usage;
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta ?? {};
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        onDelta(delta.content);
      }
      for (const call of delta.tool_calls ?? []) {
        const index: number = call.index ?? 0;
        const existing = partials.get(index) ?? { id: "", name: "", arguments: "" };
        if (call.id) existing.id = call.id;
        if (call.function?.name) existing.name = call.function.name;
        if (call.function?.arguments) existing.arguments += call.function.arguments;
        partials.set(index, existing);
      }
    }
  }

  const toolCalls = [...partials.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, call]) => ({
      id: call.id || `call_${index}`,
      name: call.name,
      arguments: call.arguments,
    }))
    .filter((call) => call.name);

  return { content, toolCalls, finishReason, usage };
}

/* ------------------------- deterministic state build ----------------------- */

/**
 * The state panel is assembled from tool RESULTS only, so every figure a judge
 * sees came from an AgentCart API response, never from model prose.
 */
function collect(toolName: string, result: ExternalToolResult, state: BuyerState) {
  if (toolName === "discover_merchant" && result.ok) {
    const m = result.data as Record<string, any>;
    const policy = (m["commerce_policy"] ?? {}) as Record<string, any>;
    const caps = (m["capabilities"] ?? {}) as Record<string, any>;
    state.manifest = {
      merchant: String(m["merchant"] ?? ""),
      currency: String(m["currency"] ?? "INR"),
      api_version: m["api_version"] ? String(m["api_version"]) : null,
      negotiation_enabled: Boolean(caps["negotiation"]),
      checkout_enabled: Boolean(caps["checkout"]),
      max_discount_percent:
        policy["max_discount_percent"] !== undefined ? Number(policy["max_discount_percent"]) : null,
      approval_required_above:
        policy["approval_required_above"] !== undefined
          ? Number(policy["approval_required_above"])
          : null,
      max_order_value:
        policy["max_order_value"] !== undefined ? Number(policy["max_order_value"]) : null,
    };
    return;
  }

  if (toolName === "search_catalog" && result.ok) {
    const data = result.data as Record<string, any>;
    const rows = (data["results"] ?? data["products"] ?? []) as Array<Record<string, any>>;
    state.no_match = rows.length === 0;
    state.candidates = rows.slice(0, 5).map((r) => ({
      product_id: String(r["product_id"]),
      name: String(r["name"]),
      price: Number(r["price"] ?? 0),
      currency: String(r["currency"] ?? "INR"),
      availability: String(r["availability"] ?? "unknown"),
      in_stock: Boolean(r["in_stock"]),
    }));
    return;
  }

  if (toolName === "get_product" && result.ok) {
    const p = ((result.data as Record<string, any>)["product"] ?? {}) as Record<string, any>;
    if (p["product_id"]) {
      state.selected_product = {
        product_id: String(p["product_id"]),
        name: String(p["name"]),
        price: Number(p["price"] ?? 0),
        currency: String(p["currency"] ?? "INR"),
      };
      state.no_match = false;
    }
    return;
  }

  if (toolName === "get_quote" && result.ok) {
    const q = result.data as Record<string, any>;
    state.quote = {
      quote_id: String(q["quote_id"]),
      product_name: String(q["product_name"] ?? ""),
      quantity: Number(q["quantity"] ?? 1),
      requested_discount_percent: Number(q["requested_discount_percent"] ?? 0),
      allowed_discount_percent: Number(q["allowed_discount_percent"] ?? 0),
      final_amount: Number(q["final_amount"] ?? 0),
      currency: String(q["currency"] ?? "INR"),
      requires_merchant_approval: Boolean(q["requires_merchant_approval"]),
      policy_reason: String(q["policy_reason"] ?? ""),
      expires_at: String(q["expires_at"] ?? ""),
    };
    return;
  }

  if (toolName === "negotiate" && result.ok) {
    const n = result.data as Record<string, any>;
    const quote = (n["quote"] ?? null) as Record<string, any> | null;
    state.negotiation = {
      decision: String(n["decision"] ?? "reject"),
      requested_discount_percent: Number(n["requested_discount_percent"] ?? 0),
      policy_limit_percent: Number(n["policy_limit_percent"] ?? 0),
      approved_discount_percent: Number(n["approved_discount_percent"] ?? 0),
      round_number: Number(n["round_number"] ?? 0),
      rounds_remaining: Number(n["rounds_remaining"] ?? 0),
      policy_reason: String(n["policy_reason"] ?? ""),
      final_amount: quote ? Number(quote["final_amount"] ?? 0) : null,
    };
    if (quote?.["quote_id"]) {
      state.quote = {
        quote_id: String(quote["quote_id"]),
        product_name: String(quote["product_name"] ?? ""),
        quantity: Number(quote["quantity"] ?? 1),
        requested_discount_percent: Number(quote["requested_discount_percent"] ?? 0),
        allowed_discount_percent: Number(quote["allowed_discount_percent"] ?? 0),
        final_amount: Number(quote["final_amount"] ?? 0),
        currency: String(quote["currency"] ?? "INR"),
        requires_merchant_approval: Boolean(quote["requires_merchant_approval"]),
        policy_reason: String(quote["policy_reason"] ?? ""),
        expires_at: String(quote["expires_at"] ?? ""),
      };
    }
    return;
  }

  if (toolName === "request_checkout") {
    if (result.ok) {
      const c = result.data as Record<string, any>;
      const order = (c["order"] ?? {}) as Record<string, any>;
      state.checkout = {
        accepted: true,
        order_id: order["order_id"] ? String(order["order_id"]) : null,
        status: order["status"] ? String(order["status"]) : null,
        final_amount: order["final_amount"] !== undefined ? Number(order["final_amount"]) : null,
        currency: order["currency"] ? String(order["currency"]) : null,
        approval_required: Boolean(order["approval_required"]),
        payment_state: order["payment_state"] ? String(order["payment_state"]) : null,
        next_action: String(c["next_action"] ?? ""),
        error: null,
      };
    } else if (result.error) {
      state.checkout = {
        accepted: false,
        order_id: null,
        status: null,
        final_amount: null,
        currency: null,
        approval_required: false,
        payment_state: null,
        next_action: "Checkout was refused by the merchant server.",
        error: { code: result.error.code, message: result.error.message },
      };
    }
  }
}

function policyDecisionLabel(toolName: string, result: ExternalToolResult): string | undefined {
  if (!result.ok) return result.error ? `refused: ${result.error.code}` : undefined;
  const data = result.data as Record<string, any> | null;
  if (!data) return undefined;
  if (toolName === "negotiate") {
    return `${String(data["decision"])} · requested ${Number(data["requested_discount_percent"])}% · policy limit ${Number(data["policy_limit_percent"])}% · approved ${Number(data["approved_discount_percent"])}%`;
  }
  if (toolName === "get_quote") {
    return `allowed discount ${Number(data["allowed_discount_percent"])}% · approval ${data["requires_merchant_approval"] ? "required" : "not required"}`;
  }
  if (toolName === "request_checkout") {
    const order = (data["order"] ?? {}) as Record<string, any>;
    return `order ${String(order["status"] ?? "unknown")}`;
  }
  return undefined;
}

/* ---------------------------------- runner --------------------------------- */

export type ExternalBuyerRunOptions = {
  userId: string;
  message: string;
  scenarioId?: string | null;
  baseUrl: string;
  emit: Emit;
  signal: AbortSignal;
};

export async function runExternalBuyer(options: ExternalBuyerRunOptions) {
  const { userId, message, baseUrl, emit, signal } = options;
  const startedAt = Date.now();
  const apiKey = process.env["LOVABLE_API_KEY"];
  const state = emptyState();

  const merchant = await resolveMerchant(DEFAULT_MERCHANT_SLUG);
  if (!merchant) {
    emit({ type: "notice", code: "merchant_unavailable", message: "No public merchant is available." });
    emit({
      type: "done",
      status: "failed",
      step_count: 0,
      tool_call_count: 0,
      duration_ms: Date.now() - startedAt,
      stop_reason: "merchant_unavailable",
      state,
    });
    return;
  }

  // Buyer session + run rows: written by this harness with trusted credentials.
  // The buyer agent itself only ever receives the opaque session token.
  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from("agent_sessions")
    .insert({
      user_id: userId,
      merchant_id: merchant.id,
      title: `${EXTERNAL_SESSION_PREFIX} ${message.slice(0, 100)}`,
      status: "running",
    })
    .select("id")
    .single();
  if (sessionError || !sessionRow) {
    throw new Error(sessionError?.message ?? "Could not open an external buyer session.");
  }
  const sessionId = sessionRow.id;

  const { data: runRow, error: runError } = await supabaseAdmin
    .from("agent_runs")
    .insert({
      session_id: sessionId,
      status: "running",
      model: EXTERNAL_BUYER_MODEL,
      user_request: message.slice(0, 1000),
    })
    .select("id")
    .single();
  if (runError || !runRow) throw new Error(runError?.message ?? "Could not start external buyer run.");
  const runDbId = runRow.id;

  emit({
    type: "session",
    session_id: sessionId,
    run_id: runDbId,
    model: EXTERNAL_BUYER_MODEL,
    run_type: EXTERNAL_RUN_TYPE,
    merchant: { slug: merchant.slug, name: merchant.name, currency: merchant.currency },
  });

  const { token } = await mintAgentSessionToken(sessionId);
  const client = new AgentCommerceClient({
    baseUrl,
    merchantSlug: merchant.slug,
    sessionToken: token,
    onCall: (call) => emit({ type: "api_call", call }),
  });

  let stepNumber = 0;
  let modelTurns = 0;
  let toolCallCount = 0;
  let status: "completed" | "failed" | "stopped" = "completed";
  let stopReason = "model_finished";
  let errorText: string | null = null;
  let usage: ModelTurn["usage"] = null;
  const trustedAmounts = new Set<number>();
  let lastModelText = "";


  const recordStep = async (step: {
    step_type: string;
    status: string;
    label: string;
    input_summary?: string;
    output_summary?: string;
    latency_ms?: number;
    tool_name?: string;
    policy_decision?: string;
  }) => {
    const number = ++stepNumber;
    emit({
      type: "step",
      step_number: number,
      step_type: step.step_type,
      status: step.status,
      label: step.label,
      ...(step.latency_ms !== undefined ? { latency_ms: step.latency_ms } : {}),
      ...(step.tool_name ? { tool_name: step.tool_name } : {}),
      ...(step.policy_decision ? { policy_decision: step.policy_decision } : {}),
    });
    const { data } = await supabaseAdmin
      .from("agent_steps")
      .insert({
        run_id: runDbId,
        step_number: number,
        step_type: step.step_type,
        status: step.status,
        input_summary: summarize(step.input_summary ?? step.label),
        output_summary: summarize(
          [step.output_summary ?? "", step.policy_decision ? `policy: ${step.policy_decision}` : ""]
            .filter(Boolean)
            .join(" | "),
        ),
        latency_ms: step.latency_ms ?? null,
      })
      .select("id")
      .maybeSingle();
    return data?.id ?? null;
  };

  await recordStep({
    step_type: "external_intent",
    status: "completed",
    label: "External buyer received shopper intent",
    input_summary: message,
    output_summary: `Will contact ${merchant.slug} over the public Agent Commerce API only.`,
  });

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: message },
  ];

  try {
    if (!apiKey) throw new GatewayError(401, "AI access is not configured for this project.");

    for (;;) {
      if (modelTurns >= EXTERNAL_MAX_TURNS) {
        status = "stopped";
        stopReason = "turn_limit_reached";
        emit({
          type: "notice",
          code: "turn_limit_reached",
          message: `Stopped safely after the ${EXTERNAL_MAX_TURNS}-turn limit.`,
        });
        break;
      }

      modelTurns += 1;
      const modelStart = Date.now();
      const turn = await callModel(apiKey, messages, (delta) => emit({ type: "text", delta }), signal);
      if (turn.usage) usage = turn.usage;
      if (turn.content.trim()) lastModelText = turn.content;



      await recordStep({
        step_type: turn.toolCalls.length > 0 ? "model_tool_plan" : "model_answer",
        status: "completed",
        label:
          turn.toolCalls.length > 0
            ? `Buyer agent selected ${turn.toolCalls.length} API call(s)`
            : "Buyer agent composed its report",
        input_summary: `${messages.length} conversation items`,
        output_summary:
          turn.toolCalls.length > 0
            ? turn.toolCalls.map((c) => c.name).join(", ")
            : summarize(turn.content),
        latency_ms: Date.now() - modelStart,
      });

      if (turn.toolCalls.length === 0) {
        stopReason = turn.finishReason ?? "model_finished";
        break;
      }

      messages.push({
        role: "assistant",
        content: turn.content || null,
        tool_calls: turn.toolCalls.map((c) => ({
          id: c.id,
          type: "function" as const,
          function: { name: c.name, arguments: c.arguments || "{}" },
        })),
      });

      let limitHit = false;
      for (const call of turn.toolCalls) {
        if (toolCallCount >= EXTERNAL_MAX_TOOL_CALLS) {
          limitHit = true;
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({
              ok: false,
              error: { code: "tool_call_limit_reached", message: "API call budget exhausted." },
            }),
          });
          continue;
        }
        toolCallCount += 1;

        const result = await executeExternalTool(call.name, call.arguments, client);
        collect(call.name, result, state);
        if (result.ok) {
          collectTrustedAmounts(result.data, trustedAmounts);
          emit({ type: "trusted_amounts", amounts: [...trustedAmounts] });
        }
        const decision = policyDecisionLabel(call.name, result);


        const stepId = await recordStep({
          step_type: "external_api_call",
          status: result.ok ? "completed" : "failed",
          label: result.label,
          tool_name: call.name,
          input_summary: call.arguments,
          output_summary: result.ok
            ? `HTTP ${result.call?.status ?? 200} · ${result.call?.response_summary ?? "ok"}`
            : `HTTP ${result.call?.status ?? 0} · ${result.error?.message ?? "failed"}`,
          ...(decision ? { policy_decision: decision } : {}),
          latency_ms: result.latency_ms,
        });

        await supabaseAdmin.from("tool_calls").insert({
          run_id: runDbId,
          step_id: stepId,
          tool_name: call.name,
          input_json: clip(safeJson(call.arguments)) as never,
          output_json: clip(
            result.ok
              ? { http_status: result.call?.status ?? 200, data: result.data }
              : { http_status: result.call?.status ?? 0, error: result.error },
          ) as never,
          status: result.ok ? "success" : "error",
          latency_ms: result.latency_ms,
          error: result.ok ? null : (result.error?.message ?? "failed"),
        } as never);

        emit({ type: "state", state });

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(
            result.ok
              ? { ok: true, http_status: result.call?.status ?? 200, data: result.data }
              : { ok: false, http_status: result.call?.status ?? 0, error: result.error },
          ).slice(0, 12_000),
        });
      }

      if (limitHit) {
        status = "stopped";
        stopReason = "tool_call_limit_reached";
        emit({
          type: "notice",
          code: "tool_call_limit_reached",
          message: `Stopped safely after the ${EXTERNAL_MAX_TOOL_CALLS}-API-call limit.`,
        });
        break;
      }
    }
  } catch (error) {
    status = "failed";
    const aborted = error instanceof Error && error.name === "AbortError";
    stopReason = aborted ? "client_disconnected" : "agent_error";
    errorText =
      error instanceof GatewayError
        ? error.message
        : aborted
          ? "The request was cancelled."
          : "The external buyer could not complete this request.";
    console.error("[external-buyer] run failed", error);
    emit({ type: "notice", code: "agent_error", message: errorText });
  }

  // Defence-in-depth #3: validate the closing message against the trusted ledger.
  // An unsupported figure is never shown as if the merchant had quoted it — the
  // answer is replaced with a request for a fresh server quote.
  const unsupported = unsupportedMonetaryClaims(lastModelText, trustedAmounts);
  const corrected = unsupported.length > 0;
  if (corrected) {
    emit({
      type: "notice",
      code: "unsupported_monetary_claim",
      message: `Withheld ${unsupported.length} amount(s) that no merchant API response supports.`,
    });
    await recordStep({
      step_type: "final_answer_validation",
      status: "failed",
      label: "Closing message failed monetary-provenance validation",
      input_summary: summarize(lastModelText),
      output_summary: `unsupported amounts: ${unsupported.join(", ")} · answer replaced with a fresh-quote request`,
    });
  }
  emit({
    type: "final_text",
    text: corrected ? SAFE_REPLACEMENT_TEXT : lastModelText,
    corrected,
    unsupported_amounts: unsupported,
  });

  const durationMs = Date.now() - startedAt;

  await supabaseAdmin
    .from("agent_runs")
    .update({
      status,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      step_count: stepNumber,
      tool_call_count: toolCallCount,
      stop_reason: stopReason,
      error: errorText,
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      total_tokens: usage?.total_tokens ?? null,
    })
    .eq("id", runDbId);

  await supabaseAdmin
    .from("agent_sessions")
    .update({
      status: status === "failed" ? "failed" : "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  emit({
    type: "done",
    status,
    step_count: stepNumber,
    tool_call_count: toolCallCount,
    duration_ms: durationMs,
    stop_reason: stopReason,
    state,
  });
}

function safeJson(value: string) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return { raw: value.slice(0, 500) };
  }
}

export const EXTERNAL_BUYER_LIMITS = {
  maxTurns: EXTERNAL_MAX_TURNS,
  maxToolCalls: EXTERNAL_MAX_TOOL_CALLS,
};
