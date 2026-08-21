// Phase 07 — Judge Mode server layer: evidence, deterministic demo run, chaos lab.
//
// SECURITY / SAFETY CONTRACT
// - This module adds NO new money authority. It only calls the existing Phase 02–06
//   server paths (quote endpoint, policy engine, checkout, payments) so that what a
//   judge sees is the real system, not a mock.
// - Chaos scenarios inject *failures*, never fake successes: nothing here can mark a
//   payment captured, approve an order, or bypass a policy.
// - Replay is observation-only: it re-reads persisted trace rows and never re-executes.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canTransition, type CheckoutState } from "@/lib/checkout-state";
import { requestCheckout, reviewApproval } from "@/lib/checkout.server";
import { runNegotiationRound, requestServerQuote } from "@/lib/negotiation.server";
import { handleRazorpayWebhook, initializePayment } from "@/lib/payments.server";
import { getPolicy, resolveMerchant, fetchActiveProducts } from "@/lib/public-api.server";
import { getWebhookSecret, hmacSha256Hex, isRazorpayConfigured } from "@/lib/razorpay.server";
import type { ChaosScenarioId } from "@/lib/judge-facts";

/* ------------------------------- shared types ------------------------------ */

export type JudgeStep = {
  number: number;
  title: string;
  phase: string;
  status: "ok" | "blocked" | "skipped" | "failed";
  latency_ms: number;
  input_summary: string;
  output_summary: string;
  authority: "server" | "database" | "razorpay" | "merchant" | "agent";
  entity: { label: string; id: string } | null;
};

export type JudgeDemoResult = {
  ok: boolean;
  session_id: string | null;
  run_id: string | null;
  order_id: string | null;
  merchant: string | null;
  currency: string;
  steps: JudgeStep[];
  summary: {
    list_amount: number;
    negotiated_amount: number;
    discount_percent: number;
    policy_cap_percent: number;
    approval_required: boolean;
    order_status: CheckoutState | null;
    payment_next_action: string;
    duration_ms: number;
  } | null;
  error: { code: string; message: string } | null;
};

/* --------------------------------- helpers -------------------------------- */

async function ownedMerchant(userId: string) {
  const merchant = await resolveMerchant(null);
  if (!merchant) return null;
  const { data } = await supabaseAdmin
    .from("merchants")
    .select("id")
    .eq("id", merchant.id)
    .eq("owner_id", userId)
    .maybeSingle();
  return data ? merchant : null;
}

async function judgeSession(userId: string, merchantId: string, title: string) {
  const { data: existing } = await supabaseAdmin
    .from("agent_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("merchant_id", merchantId)
    .eq("title", title)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabaseAdmin
    .from("agent_sessions")
    .insert({ user_id: userId, merchant_id: merchantId, title, status: "running" } as never)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not open a judge session.");
  return data.id;
}

/* ------------------------------ 1. demo run -------------------------------- */

const DEMO_TITLE = "Judge Mode · deterministic demo run";

/**
 * One end-to-end agentic transaction executed through the real production paths:
 * discovery -> negotiation -> policy -> checkout -> approval -> Razorpay order.
 * The final card payment is intentionally left to a human in Razorpay test checkout.
 */
export async function runJudgeDemo(args: {
  userId: string;
  baseUrl: string;
}): Promise<JudgeDemoResult> {
  const t0 = Date.now();
  const steps: JudgeStep[] = [];
  const push = (s: Omit<JudgeStep, "number">) => {
    steps.push({ number: steps.length + 1, ...s });
    return steps[steps.length - 1]!;
  };
  const fail = (code: string, message: string): JudgeDemoResult => ({
    ok: false,
    session_id: null,
    run_id: null,
    order_id: null,
    merchant: null,
    currency: "INR",
    steps,
    summary: null,
    error: { code, message },
  });

  const merchant = await ownedMerchant(args.userId);
  if (!merchant) {
    return fail(
      "merchant_required",
      "Sign in as the merchant owner of the demo store to run the judge demo.",
    );
  }

  const policy = await getPolicy(merchant.id);
  const products = await fetchActiveProducts(merchant.id);
  const sellable = (products ?? []).filter((p: any) => Number(p.stock_quantity) > 0);
  if (sellable.length === 0) return fail("no_products", "The demo merchant has no sellable stock.");

  const target =
    sellable.find((p: any) => String(p.name).toLowerCase().includes("developerbook")) ??
    [...sellable].sort((a: any, b: any) => Number(b.price) - Number(a.price))[0]!;

  const sessionId = await judgeSession(args.userId, merchant.id, DEMO_TITLE);
  const { data: run } = await supabaseAdmin
    .from("agent_runs")
    .insert({
      session_id: sessionId,
      status: "running",
      model: "deterministic/judge-demo",
      user_request: `Buy 1 x ${target.name} at the best price this merchant's policy allows.`,
    } as never)
    .select("id")
    .single();
  const runId = run?.id ?? null;

  let stepNumber = 0;
  let toolCalls = 0;
  const record = async (step: JudgeStep, tool: string | null) => {
    if (!runId) return;
    stepNumber += 1;
    const { data: row } = await supabaseAdmin
      .from("agent_steps")
      .insert({
        run_id: runId,
        step_number: stepNumber,
        step_type: tool ? "tool_call" : step.phase,
        status: step.status === "ok" ? "completed" : step.status,
        input_summary: step.input_summary.slice(0, 500),
        output_summary: step.output_summary.slice(0, 500),
        latency_ms: step.latency_ms,
      } as never)
      .select("id")
      .single();
    if (tool) {
      toolCalls += 1;
      await supabaseAdmin.from("tool_calls").insert({
        run_id: runId,
        step_id: row?.id ?? null,
        tool_name: tool,
        status: step.status === "ok" ? "completed" : "failed",
        latency_ms: step.latency_ms,
        input_json: { summary: step.input_summary },
        output_json: { summary: step.output_summary, entity: step.entity },
      } as never);
    }
  };

  const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
    const started = Date.now();
    const value = await fn();
    return [value, Date.now() - started];
  };

  const finishRun = async (status: "completed" | "failed", stopReason: string) => {
    if (!runId) return;
    await supabaseAdmin
      .from("agent_runs")
      .update({
        status,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - t0,
        step_count: stepNumber,
        tool_call_count: toolCalls,
        stop_reason: stopReason,
      } as never)
      .eq("id", runId);
  };

  // --- step 1: intent -------------------------------------------------------
  const intent = push({
    title: "Buyer intent captured",
    phase: "discovery",
    status: "ok",
    latency_ms: 0,
    input_summary: `"I need a developer laptop. Best price you can do for 1 unit."`,
    output_summary: `Deterministic demo intent for merchant ${merchant.slug}.`,
    authority: "agent",
    entity: { label: "session", id: sessionId },
  });
  await record(intent, null);

  // --- step 2: catalog discovery (public API) -------------------------------
  const [searchOut, searchMs] = await timed(async () => {
    const res = await fetch(
      new URL(
        `/api/public/search?q=${encodeURIComponent(target.name.split(" ")[0] ?? "laptop")}&merchant=${merchant.slug}`,
        args.baseUrl,
      ),
    );
    return (await res.json().catch(() => null)) as any;
  });
  const found = Array.isArray(searchOut?.results) ? searchOut.results.length : 0;
  const searchStep = push({
    title: "search_catalog",
    phase: "discovery",
    status: found > 0 ? "ok" : "failed",
    latency_ms: searchMs,
    input_summary: `GET /api/public/search?q=${target.name.split(" ")[0]}&merchant=${merchant.slug}`,
    output_summary: `${found} public catalog result(s); no prices are trusted from the client.`,
    authority: "server",
    entity: null,
  });
  await record(searchStep, "search_catalog");

  // --- step 3: product inspection ------------------------------------------
  const [productOut, productMs] = await timed(async () => {
    const res = await fetch(new URL(`/api/public/products/${target.id}`, args.baseUrl));
    return (await res.json().catch(() => null)) as any;
  });
  const productStep = push({
    title: "get_product",
    phase: "discovery",
    status: productOut?.id ? "ok" : "failed",
    latency_ms: productMs,
    input_summary: `GET /api/public/products/${target.id}`,
    output_summary: `${target.name} · list ₹${Number(target.price).toLocaleString("en-IN")} · stock ${target.stock_quantity}`,
    authority: "server",
    entity: { label: "product", id: target.id },
  });
  await record(productStep, "get_product");

  // --- step 4: list-price quote --------------------------------------------
  const [listQuote, listMs] = await timed(() =>
    requestServerQuote({
      baseUrl: args.baseUrl,
      merchantSlug: merchant.slug,
      productId: target.id,
      quantity: 1,
      discountPercent: 0,
    }),
  );
  const listAmount = listQuote.ok ? listQuote.quote.final_amount : Number(target.price);
  const listStep = push({
    title: "get_quote (list price)",
    phase: "pricing",
    status: listQuote.ok ? "ok" : "failed",
    latency_ms: listMs,
    input_summary: "POST /api/public/quote · quantity 1 · requested discount 0%",
    output_summary: listQuote.ok
      ? `Server-computed total ₹${listAmount.toLocaleString("en-IN")} (integer paise math).`
      : `Refused: ${listQuote.error.code}`,
    authority: "server",
    entity: listQuote.ok ? { label: "quote", id: listQuote.quote.quote_id } : null,
  });
  await record(listStep, "get_quote");

  // --- step 5: bounded negotiation -----------------------------------------
  const aggressive = Math.min(100, policy.max_discount_percent + 18);
  const [negotiation, negMs] = await timed(() =>
    runNegotiationRound({
      merchant,
      buyerSessionId: sessionId,
      baseUrl: args.baseUrl,
      productId: target.id,
      quantity: 1,
      requestedDiscountPercent: aggressive,
      customerRequestSummary: "Judge Mode demo: aggressive discount request.",
    }),
  );
  const negStep = push({
    title: "propose_discount",
    phase: "negotiation",
    status: negotiation.quote ? "ok" : "blocked",
    latency_ms: negMs,
    input_summary: `Buyer agent asks for ${aggressive}% off.`,
    output_summary: `Policy decision "${negotiation.decision}": capped at ${negotiation.approved_discount_percent}% (merchant limit ${negotiation.policy_limit_percent}%). ${negotiation.policy_reason}`,
    authority: "server",
    entity: negotiation.negotiation_session_id
      ? { label: "negotiation", id: negotiation.negotiation_session_id }
      : null,
  });
  await record(negStep, "propose_discount");

  const negotiatedQuote = negotiation.quote ?? (listQuote.ok ? listQuote.quote : null);
  if (!negotiatedQuote) {
    await finishRun("failed", "no_quote");
    return { ...fail("no_quote", "No server quote could be produced."), session_id: sessionId, run_id: runId };
  }

  // --- step 6: policy authority proof --------------------------------------
  const policyStep = push({
    title: "Policy authority evaluated",
    phase: "policy",
    status: "ok",
    latency_ms: 0,
    input_summary: `max_discount ${policy.max_discount_percent}% · approval above ₹${policy.approval_required_above.toLocaleString("en-IN")} · max order ₹${policy.max_order_value.toLocaleString("en-IN")}`,
    output_summary: `Final payable ₹${negotiatedQuote.final_amount.toLocaleString("en-IN")} at ${negotiatedQuote.allowed_discount_percent}% — computed in server code, not by the model.`,
    authority: "database",
    entity: { label: "quote", id: negotiatedQuote.quote_id },
  });
  await record(policyStep, null);

  // --- step 7: checkout -----------------------------------------------------
  const idempotencyKey = `judge-demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const [checkout, checkoutMs] = await timed(() =>
    requestCheckout({
      quoteId: negotiatedQuote.quote_id,
      idempotencyKey,
      buyerSessionId: sessionId,
      userId: args.userId,
      actorType: "ai_agent",
      customerRequestSummary: "Judge Mode deterministic demo checkout.",
    }),
  );
  const checkoutStep = push({
    title: "request_checkout",
    phase: "checkout",
    status: checkout.ok ? "ok" : "blocked",
    latency_ms: checkoutMs,
    input_summary: `quote ${negotiatedQuote.quote_id} · idempotency_key ${idempotencyKey}`,
    output_summary: checkout.ok
      ? `Order ${checkout.order.order_id} created at ${checkout.order.status}; amounts copied from the quote row.`
      : `Refused: ${checkout.error.code} — ${checkout.error.message}`,
    authority: "server",
    entity: checkout.ok ? { label: "order", id: checkout.order.order_id } : null,
  });
  await record(checkoutStep, "request_checkout");

  if (!checkout.ok) {
    await finishRun("failed", checkout.error.code);
    return {
      ...fail(checkout.error.code, checkout.error.message),
      session_id: sessionId,
      run_id: runId,
      merchant: merchant.slug,
    };
  }

  let order = checkout.order;

  // --- step 8: human-in-the-loop approval ----------------------------------
  if (order.approval_required && order.status === "APPROVAL_REQUIRED") {
    const [review, reviewMs] = await timed(() =>
      reviewApproval({
        orderId: order.order_id,
        merchantId: merchant.id,
        reviewerId: args.userId,
        decision: "approve",
      }),
    );
    const approvalStep = push({
      title: "Merchant approval (human-in-the-loop)",
      phase: "approval",
      status: review.ok ? "ok" : "failed",
      latency_ms: reviewMs,
      input_summary: `₹${order.final_amount.toLocaleString("en-IN")} exceeds the ₹${policy.approval_required_above.toLocaleString("en-IN")} approval threshold. ${order.approval_reason ?? ""}`,
      output_summary: review.ok
        ? `Approved by the signed-in merchant owner; order moved to ${review.order.status}.`
        : `Approval failed: ${review.error.code}`,
      authority: "merchant",
      entity: { label: "order", id: order.order_id },
    });
    await record(approvalStep, null);
    if (review.ok) order = review.order;
  } else {
    const skip = push({
      title: "Merchant approval not required",
      phase: "approval",
      status: "skipped",
      latency_ms: 0,
      input_summary: `Order total ₹${order.final_amount.toLocaleString("en-IN")}`,
      output_summary: `Below the ₹${policy.approval_required_above.toLocaleString("en-IN")} approval threshold, so the policy allows straight-through checkout.`,
      authority: "database",
      entity: { label: "order", id: order.order_id },
    });
    await record(skip, null);
  }

  // --- step 9: Razorpay test order -----------------------------------------
  let paymentNext = "Open the buyer page and complete the Razorpay test payment.";
  if (!isRazorpayConfigured()) {
    const s = push({
      title: "Razorpay order creation",
      phase: "payment",
      status: "skipped",
      latency_ms: 0,
      input_summary: `order ${order.order_id}`,
      output_summary: "Razorpay test credentials are not configured on this environment.",
      authority: "razorpay",
      entity: { label: "order", id: order.order_id },
    });
    await record(s, null);
    paymentNext = "Razorpay test keys are not configured.";
  } else {
    const [init, initMs] = await timed(() =>
      initializePayment({ orderId: order.order_id, userId: args.userId, actorType: "buyer" }),
    );
    const s = push({
      title: "Razorpay test order created",
      phase: "payment",
      status: init.ok ? "ok" : "blocked",
      latency_ms: initMs,
      input_summary: `Amount taken from the order row: ₹${order.final_amount.toLocaleString("en-IN")} (${Math.round(order.final_amount * 100)} paise).`,
      output_summary: init.ok
        ? `Razorpay test order ${init.razorpay_order_id} for ${init.amount_minor} paise; payment state ${init.payment_status}.`
        : `Refused: ${init.error.code} — ${init.error.message}`,
      authority: "razorpay",
      entity: init.ok ? { label: "razorpay_order", id: init.razorpay_order_id } : null,
    });
    await record(s, null);
    if (!init.ok) paymentNext = `Payment could not be initialised: ${init.error.code}`;
  }

  // --- step 10: what a human must still do ---------------------------------
  const humanStep = push({
    title: "Card payment awaits a human (test mode)",
    phase: "payment",
    status: "skipped",
    latency_ms: 0,
    input_summary: "Razorpay test checkout · card 4111 1111 1111 1111 · success OTP",
    output_summary:
      "No code path in this system can mark a payment captured on its own — only a verified Razorpay signature or signed webhook can.",
    authority: "razorpay",
    entity: { label: "order", id: order.order_id },
  });
  await record(humanStep, null);

  const verifyStep = push({
    title: "Verification + webhook (on payment)",
    phase: "settlement",
    status: "skipped",
    latency_ms: 0,
    input_summary: "razorpay_order_id | razorpay_payment_id | razorpay_signature",
    output_summary:
      "HMAC verified server-side, payment re-read from Razorpay, then PAYMENT_PENDING → PAYMENT_CAPTURED → COMPLETED, with the signed webhook as an independent second source.",
    authority: "server",
    entity: { label: "order", id: order.order_id },
  });
  await record(verifyStep, null);

  await finishRun("completed", "demo_complete");

  return {
    ok: true,
    session_id: sessionId,
    run_id: runId,
    order_id: order.order_id,
    merchant: merchant.slug,
    currency: order.currency,
    steps,
    summary: {
      list_amount: listAmount,
      negotiated_amount: order.final_amount,
      discount_percent: negotiatedQuote.allowed_discount_percent,
      policy_cap_percent: policy.max_discount_percent,
      approval_required: order.approval_required,
      order_status: order.status,
      payment_next_action: paymentNext,
      duration_ms: Date.now() - t0,
    },
    error: null,
  };
}

/* -------------------------------- 2. chaos -------------------------------- */

export type ChaosResult = {
  id: ChaosScenarioId;
  status: "protected" | "unprotected" | "skipped";
  injected: string;
  observed: string;
  guard: string;
  latency_ms: number;
  evidence: Record<string, string | number | boolean>;
};

const CHAOS_TITLE = "Judge Mode · chaos lab";

export async function runChaosScenario(args: {
  scenario: ChaosScenarioId;
  userId: string;
  baseUrl: string;
}): Promise<ChaosResult> {
  const started = Date.now();
  const done = (
    r: Omit<ChaosResult, "id" | "latency_ms">,
  ): ChaosResult => ({ id: args.scenario, latency_ms: Date.now() - started, ...r });

  const merchant = await ownedMerchant(args.userId);
  if (!merchant) {
    return done({
      status: "skipped",
      injected: "—",
      observed: "Sign in as the demo merchant owner to run the chaos lab.",
      guard: "Ownership check",
      evidence: {},
    });
  }
  const policy = await getPolicy(merchant.id);
  const products = await fetchActiveProducts(merchant.id);
  const sellable = (products ?? []).filter((p: any) => Number(p.stock_quantity) > 0);
  const cheapest = [...sellable].sort((a: any, b: any) => Number(a.price) - Number(b.price))[0];

  switch (args.scenario) {
    /* ------------------------------------------------------------------ */
    case "duplicate_checkout": {
      if (!cheapest) {
        return done({ status: "skipped", injected: "—", observed: "No sellable product.", guard: "—", evidence: {} });
      }
      const quote = await requestServerQuote({
        baseUrl: args.baseUrl,
        merchantSlug: merchant.slug,
        productId: cheapest.id,
        quantity: 1,
        discountPercent: 0,
      });
      if (!quote.ok) {
        return done({
          status: "skipped",
          injected: "Two identical checkout requests",
          observed: `Could not create the seed quote: ${quote.error.code}`,
          guard: "—",
          evidence: {},
        });
      }
      const sessionId = await judgeSession(args.userId, merchant.id, CHAOS_TITLE);
      const key = `judge-chaos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const common = {
        quoteId: quote.quote.quote_id,
        idempotencyKey: key,
        buyerSessionId: sessionId,
        userId: args.userId,
        actorType: "ai_agent" as const,
        customerRequestSummary: "Chaos: duplicate checkout retry.",
      };
      const first = await requestCheckout(common);
      const second = await requestCheckout(common);
      const sameOrder =
        first.ok && second.ok && first.order.order_id === second.order.order_id;
      const replay = second.ok && second.idempotent_replay;
      const { count } = await supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchant.id)
        .eq("idempotency_key", key);
      return done({
        status: sameOrder && replay && count === 1 ? "protected" : "unprotected",
        injected: `Same quote + idempotency key ${key} submitted twice.`,
        observed:
          sameOrder && replay
            ? "Second request returned the first order as an idempotent replay; exactly one order row exists."
            : "Duplicate was not collapsed — investigate immediately.",
        guard: "Unique (merchant_id, idempotency_key) index + server replay detection",
        evidence: {
          order_id: first.ok ? first.order.order_id : "none",
          orders_created: count ?? 0,
          idempotent_replay: Boolean(replay),
          amount: first.ok ? first.order.final_amount : 0,
        },
      });
    }

    /* ------------------------------------------------------------------ */
    case "duplicate_webhook":
    case "invalid_webhook_signature": {
      if (!isRazorpayConfigured()) {
        return done({
          status: "skipped",
          injected: "Signed webhook delivery",
          observed: "Razorpay test credentials are not configured in this environment.",
          guard: "HMAC-SHA256 raw-body verification",
          evidence: {},
        });
      }
      const nonce = Math.random().toString(36).slice(2, 10);
      const payload = JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: `pay_judgechaos${nonce}`,
              order_id: `order_judgechaos${nonce}`, // deliberately not a real order
              status: "captured",
              amount: 100,
              method: "card",
            },
          },
        },
      });

      if (args.scenario === "invalid_webhook_signature") {
        const forged = await handleRazorpayWebhook({
          rawBody: payload,
          signature: "deadbeef".repeat(8),
          deliveryId: `judge-chaos-forged-${nonce}`,
        });
        return done({
          status: forged.status === 401 ? "protected" : "unprotected",
          injected: "payment.captured payload signed with a wrong HMAC.",
          observed:
            forged.status === 401
              ? "Rejected with 401 before the JSON was parsed; only a rejection row was recorded."
              : `Unexpected response: ${forged.status} ${forged.body.status}`,
          guard: "verifyWebhookSignature() — HMAC-SHA256 over the raw body, constant-time compare",
          evidence: { http_status: forged.status, result: forged.body.status },
        });
      }

      const signature = await hmacSha256Hex(getWebhookSecret(), payload);
      const deliveryId = `judge-chaos-dup-${nonce}`;
      const first = await handleRazorpayWebhook({ rawBody: payload, signature, deliveryId });
      const second = await handleRazorpayWebhook({ rawBody: payload, signature, deliveryId });
      return done({
        status: second.body.status === "duplicate" ? "protected" : "unprotected",
        injected: `Same signed delivery (${deliveryId}) sent twice.`,
        observed:
          second.body.status === "duplicate"
            ? `First delivery handled ("${first.body.status}" — the synthetic Razorpay order is unknown, so nothing was mutated); the replay was acknowledged as a duplicate without re-processing.`
            : `Replay was re-processed: ${second.body.status}`,
        guard: "webhook_events unique event id claimed before any state mutation",
        evidence: {
          first_result: first.body.status,
          second_result: second.body.status,
          http_status: second.status,
        },
      });
    }

    /* ------------------------------------------------------------------ */
    case "expired_quote": {
      if (!cheapest) {
        return done({ status: "skipped", injected: "—", observed: "No sellable product.", guard: "—", evidence: {} });
      }
      const quote = await requestServerQuote({
        baseUrl: args.baseUrl,
        merchantSlug: merchant.slug,
        productId: cheapest.id,
        quantity: 1,
        discountPercent: 0,
      });
      if (!quote.ok) {
        return done({ status: "skipped", injected: "Aged quote", observed: quote.error.code, guard: "—", evidence: {} });
      }
      await supabaseAdmin
        .from("quotes")
        .update({ expires_at: new Date(Date.now() - 60_000).toISOString() } as never)
        .eq("id", quote.quote.quote_id);

      const sessionId = await judgeSession(args.userId, merchant.id, CHAOS_TITLE);
      const attempt = await requestCheckout({
        quoteId: quote.quote.quote_id,
        idempotencyKey: `judge-chaos-exp-${Date.now().toString(36)}`,
        buyerSessionId: sessionId,
        userId: args.userId,
        actorType: "ai_agent",
        customerRequestSummary: "Chaos: expired quote checkout.",
      });
      const blocked = !attempt.ok && attempt.error.code === "quote_expired";
      return done({
        status: blocked ? "protected" : "unprotected",
        injected: `Quote ${quote.quote.quote_id} backdated past its TTL, then used for checkout.`,
        observed: blocked
          ? "Checkout refused with quote_expired; no order row and no money movement."
          : attempt.ok
            ? `An order was created (${attempt.order.order_id}) — expiry was not enforced.`
            : `Refused with a different code: ${attempt.error.code}`,
        guard: "Server re-reads quotes.expires_at at checkout time",
        evidence: {
          error_code: attempt.ok ? "none" : attempt.error.code,
          order_created: attempt.ok,
        },
      });
    }

    /* ------------------------------------------------------------------ */
    case "insufficient_inventory": {
      if (!cheapest) {
        return done({ status: "skipped", injected: "—", observed: "No sellable product.", guard: "—", evidence: {} });
      }
      const overshoot = Math.min(1000, Number(cheapest.stock_quantity) + 50);
      const quote = await requestServerQuote({
        baseUrl: args.baseUrl,
        merchantSlug: merchant.slug,
        productId: cheapest.id,
        quantity: overshoot,
        discountPercent: 0,
      });
      const blocked = !quote.ok && quote.error.code === "insufficient_inventory";
      return done({
        status: blocked ? "protected" : "unprotected",
        injected: `Quote requested for ${overshoot} units of ${cheapest.name} (stock ${cheapest.stock_quantity}).`,
        observed: blocked
          ? "Pricing authority refused with insufficient_inventory; no quote row was issued."
          : quote.ok
            ? "A quote was issued despite insufficient stock — investigate."
            : `Refused with a different code: ${quote.error.code}`,
        guard: "Stock validated in the quote endpoint and again at checkout",
        evidence: {
          requested_quantity: overshoot,
          available_quantity: Number(cheapest.stock_quantity),
          error_code: quote.ok ? "none" : quote.error.code,
        },
      });
    }

    /* ------------------------------------------------------------------ */
    case "policy_violation": {
      if (!cheapest) {
        return done({ status: "skipped", injected: "—", observed: "No sellable product.", guard: "—", evidence: {} });
      }
      const demanded = Math.min(100, policy.max_discount_percent + 40);
      const quote = await requestServerQuote({
        baseUrl: args.baseUrl,
        merchantSlug: merchant.slug,
        productId: cheapest.id,
        quantity: 1,
        discountPercent: demanded,
      });
      if (!quote.ok) {
        return done({
          status: "protected",
          injected: `${demanded}% discount demanded.`,
          observed: `Refused outright: ${quote.error.code}`,
          guard: "Server policy engine",
          evidence: { requested_percent: demanded, error_code: quote.error.code },
        });
      }
      const capped = quote.quote.allowed_discount_percent <= policy.max_discount_percent;
      return done({
        status: capped ? "protected" : "unprotected",
        injected: `Buyer agent demands ${demanded}% off (policy cap ${policy.max_discount_percent}%).`,
        observed: capped
          ? `Granted ${quote.quote.allowed_discount_percent}% — capped at the merchant policy limit. ${quote.quote.policy_reason}`
          : `Granted ${quote.quote.allowed_discount_percent}%, above the policy cap.`,
        guard: "decideDiscount() in server code; the model never computes money",
        evidence: {
          requested_percent: demanded,
          granted_percent: quote.quote.allowed_discount_percent,
          policy_cap_percent: policy.max_discount_percent,
          final_amount: quote.quote.final_amount,
        },
      });
    }

    /* ------------------------------------------------------------------ */
    case "payment_state_guard": {
      const illegal = canTransition("PAYMENT_PENDING", "COMPLETED");
      const alsoIllegal = canTransition("APPROVAL_REQUIRED", "COMPLETED");
      const { count: stuck } = await supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchant.id)
        .eq("status", "PAYMENT_PENDING");
      return done({
        status: !illegal && !alsoIllegal ? "protected" : "unprotected",
        injected: "Attempt to treat an unpaid order as completed (PAYMENT_PENDING → COMPLETED).",
        observed:
          !illegal && !alsoIllegal
            ? "Rejected by the state machine; the same rule is enforced by the enforce_order_transition() trigger in PostgreSQL, so bypassing the app does not help."
            : "The state machine allowed an illegal jump — investigate.",
        guard: "ALLOWED_TRANSITIONS + database trigger",
        evidence: {
          "PAYMENT_PENDING→COMPLETED": illegal,
          "APPROVAL_REQUIRED→COMPLETED": alsoIllegal,
          orders_awaiting_payment: stuck ?? 0,
        },
      });
    }
  }
}

/* ------------------------------- 3. evidence ------------------------------ */

export type JudgeEvidence = {
  runs: { total: number; completed: number; failed: number; avg_duration_ms: number };
  tools: { total: number; failed: number; avg_latency_ms: number };
  negotiation: { rounds: number; countered: number; rejected: number; capped_percent_avg: number };
  checkout: {
    orders: number;
    approval_required: number;
    approved: number;
    rejected: number;
    completed: number;
    awaiting_payment: number;
  };
  payments: { total: number; verified: number; failed: number; captured_value: number };
  webhooks: { total: number; processed: number; duplicates: number; rejected: number };
  api: { requests: number; errors: number; avg_latency_ms: number };
  integrity: { quotes_issued: number; policy_capped_quotes: number; audit_events: number };
};

const avg = (values: number[]) =>
  values.length === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

export async function collectJudgeEvidence(merchantId: string): Promise<JudgeEvidence> {
  const [runsRes, toolsRes, roundsRes, ordersRes, approvalsRes, paymentsRes, hooksRes, apiRes, quotesRes, auditRes] =
    await Promise.all([
      supabaseAdmin.from("agent_runs").select("status, duration_ms").limit(2000),
      supabaseAdmin.from("tool_calls").select("status, latency_ms").limit(5000),
      supabaseAdmin
        .from("negotiation_rounds")
        .select("policy_decision, proposed_discount_percent")
        .limit(2000),
      supabaseAdmin.from("orders").select("status, approval_required").eq("merchant_id", merchantId).limit(2000),
      supabaseAdmin.from("checkout_approvals").select("status").eq("merchant_id", merchantId).limit(2000),
      supabaseAdmin.from("payments").select("status, amount").eq("merchant_id", merchantId).limit(2000),
      supabaseAdmin.from("webhook_events").select("status").limit(2000),
      supabaseAdmin.from("api_request_logs").select("success, latency_ms").limit(5000),
      supabaseAdmin
        .from("quotes")
        .select("policy_applied, requested_discount_percent, allowed_discount_percent")
        .eq("merchant_id", merchantId)
        .limit(5000),
      supabaseAdmin
        .from("checkout_audit_events")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchantId),
    ]);

  const runs = runsRes.data ?? [];
  const tools = toolsRes.data ?? [];
  const rounds = roundsRes.data ?? [];
  const orders = ordersRes.data ?? [];
  const approvals = approvalsRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const hooks = hooksRes.data ?? [];
  const api = apiRes.data ?? [];
  const quotes = quotesRes.data ?? [];

  return {
    runs: {
      total: runs.length,
      completed: runs.filter((r) => r.status === "completed").length,
      failed: runs.filter((r) => r.status === "failed").length,
      avg_duration_ms: avg(runs.map((r) => Number(r.duration_ms ?? 0)).filter((n) => n > 0)),
    },
    tools: {
      total: tools.length,
      failed: tools.filter((t) => t.status !== "completed").length,
      avg_latency_ms: avg(tools.map((t) => Number(t.latency_ms ?? 0)).filter((n) => n > 0)),
    },
    negotiation: {
      rounds: rounds.length,
      countered: rounds.filter((r) => r.policy_decision === "counter").length,
      rejected: rounds.filter((r) => r.policy_decision === "reject").length,
      capped_percent_avg: avg(rounds.map((r) => Number(r.proposed_discount_percent ?? 0))),
    },
    checkout: {
      orders: orders.length,
      approval_required: orders.filter((o) => o.approval_required).length,
      approved: approvals.filter((a) => a.status === "approved").length,
      rejected: approvals.filter((a) => a.status === "rejected").length,
      completed: orders.filter((o) => o.status === "COMPLETED").length,
      awaiting_payment: orders.filter((o) => o.status === "PAYMENT_PENDING").length,
    },
    payments: {
      total: payments.length,
      verified: payments.filter((p) => p.status === "VERIFIED" || p.status === "CAPTURED").length,
      failed: payments.filter((p) => p.status === "FAILED").length,
      captured_value: payments
        .filter((p) => p.status === "VERIFIED" || p.status === "CAPTURED")
        .reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    },
    webhooks: {
      total: hooks.length,
      processed: hooks.filter((h) => h.status === "processed").length,
      duplicates: hooks.filter((h) => h.status === "duplicate").length,
      rejected: hooks.filter((h) => h.status === "rejected").length,
    },
    api: {
      requests: api.length,
      errors: api.filter((r) => !r.success).length,
      avg_latency_ms: avg(api.map((r) => Number(r.latency_ms ?? 0))),
    },
    integrity: {
      quotes_issued: quotes.length,
      policy_capped_quotes: quotes.filter(
        (q) => Number(q.allowed_discount_percent) < Number(q.requested_discount_percent),
      ).length,
      audit_events: auditRes.count ?? 0,
    },
  };
}

/* -------------------------- 4. replay (read-only) -------------------------- */

export type JudgeRunSummary = {
  run_id: string;
  session_id: string;
  title: string | null;
  model: string;
  status: string;
  user_request: string | null;
  started_at: string;
  duration_ms: number | null;
  step_count: number;
  tool_call_count: number;
  total_tokens: number | null;
};

export async function listJudgeRuns(userId: string): Promise<JudgeRunSummary[]> {
  const { data: sessions } = await supabaseAdmin
    .from("agent_sessions")
    .select("id, title")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(100);
  const sessionIds = (sessions ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return [];
  const titles = new Map((sessions ?? []).map((s) => [s.id, s.title]));

  const { data, error } = await supabaseAdmin
    .from("agent_runs")
    .select(
      "id, session_id, model, status, user_request, started_at, duration_ms, step_count, tool_call_count, total_tokens",
    )
    .in("session_id", sessionIds)
    .order("started_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    run_id: r.id,
    session_id: r.session_id,
    title: titles.get(r.session_id) ?? null,
    model: r.model,
    status: r.status,
    user_request: r.user_request,
    started_at: r.started_at,
    duration_ms: r.duration_ms,
    step_count: r.step_count,
    tool_call_count: r.tool_call_count,
    total_tokens: r.total_tokens,
  }));
}

export type JudgeReplayStep = {
  step_number: number;
  step_type: string;
  status: string;
  input_summary: string | null;
  output_summary: string | null;
  latency_ms: number | null;
  created_at: string;
  tool_name: string | null;
};

export type JudgeReplay = {
  run: JudgeRunSummary | null;
  steps: JudgeReplayStep[];
  audit: Array<{
    id: string;
    event: string;
    actor_type: string;
    from_status: string | null;
    to_status: string | null;
    reason: string | null;
    created_at: string;
  }>;
  observation_only: true;
};

/** Observation-only: re-reads persisted rows. It never re-executes a single step. */
export async function replayJudgeRun(args: { runId: string; userId: string }): Promise<JudgeReplay> {
  const runs = await listJudgeRuns(args.userId);
  const run = runs.find((r) => r.run_id === args.runId) ?? null;
  if (!run) return { run: null, steps: [], audit: [], observation_only: true };

  const [{ data: steps }, { data: calls }] = await Promise.all([
    supabaseAdmin
      .from("agent_steps")
      .select("id, step_number, step_type, status, input_summary, output_summary, latency_ms, created_at")
      .eq("run_id", args.runId)
      .order("step_number", { ascending: true })
      .limit(200),
    supabaseAdmin.from("tool_calls").select("step_id, tool_name").eq("run_id", args.runId).limit(200),
  ]);
  const toolByStep = new Map((calls ?? []).map((c: any) => [c.step_id, c.tool_name]));

  const { data: audit } = await supabaseAdmin
    .from("checkout_audit_events")
    .select("id, event, actor_type, from_status, to_status, reason, created_at, buyer_session_id")
    .eq("buyer_session_id", run.session_id)
    .order("created_at", { ascending: true })
    .limit(100);

  return {
    run,
    steps: (steps ?? []).map((s: any) => ({
      step_number: s.step_number,
      step_type: s.step_type,
      status: s.status,
      input_summary: s.input_summary,
      output_summary: s.output_summary,
      latency_ms: s.latency_ms,
      created_at: s.created_at,
      tool_name: toolByStep.get(s.id) ?? null,
    })),
    audit: (audit ?? []).map((a: any) => ({
      id: a.id,
      event: a.event,
      actor_type: a.actor_type,
      from_status: a.from_status,
      to_status: a.to_status,
      reason: a.reason,
      created_at: a.created_at,
    })),
    observation_only: true,
  };
}

/* --------------------- 5. money authority (live proof) -------------------- */

export type MoneyAuthorityRow = {
  stage: string;
  authority: string;
  value: string;
  matches: boolean | null;
  note: string;
};

export type MoneyAuthorityProof = {
  order_id: string | null;
  currency: string;
  rows: MoneyAuthorityRow[];
  policy: {
    max_discount_percent: number;
    max_order_value: number;
    approval_required_above: number;
    allow_negotiation: boolean;
  };
};

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export async function buildMoneyAuthorityProof(merchantId: string): Promise<MoneyAuthorityProof> {
  const policy = await getPolicy(merchantId);
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select(
      "id, currency, subtotal_amount, discount_amount, final_amount, approval_required, status, quote_id, quotes(final_amount, allowed_discount_percent, requested_discount_percent, unit_price), payments(amount, amount_minor, status)",
    )
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const base = {
    max_discount_percent: policy.max_discount_percent,
    max_order_value: policy.max_order_value,
    approval_required_above: policy.approval_required_above,
    allow_negotiation: policy.allow_negotiation,
  };

  if (!order) {
    return { order_id: null, currency: "INR", rows: [], policy: base };
  }

  const quote = ((order as any).quotes ?? null) as any;
  const payment = (((order as any).payments ?? [])[0] ?? null) as any;
  const orderFinal = Number(order.final_amount);

  const rows: MoneyAuthorityRow[] = [
    {
      stage: "1 · Merchant policy",
      authority: "PostgreSQL merchant_policies",
      value: `cap ${policy.max_discount_percent}% · approval above ${inr(policy.approval_required_above)}`,
      matches: null,
      note: "Set by the merchant in the console. The agent can read it, never write it.",
    },
    {
      stage: "2 · Quote (pricing authority)",
      authority: "/api/public/quote · integer paise",
      value: quote ? inr(Number(quote.final_amount)) : "—",
      matches: quote ? Number(quote.allowed_discount_percent) <= policy.max_discount_percent : null,
      note: quote
        ? `Requested ${Number(quote.requested_discount_percent)}% → granted ${Number(quote.allowed_discount_percent)}%.`
        : "No quote row.",
    },
    {
      stage: "3 · Order",
      authority: "requestCheckout() server function",
      value: inr(orderFinal),
      matches: quote ? Math.abs(Number(quote.final_amount) - orderFinal) < 0.005 : null,
      note: "Copied from the quote row; no client-supplied amount is accepted.",
    },
    {
      stage: "4 · Approval gate",
      authority: "merchant_policies.approval_required_above",
      value: order.approval_required ? "human approval required" : "straight-through",
      matches: order.approval_required === orderFinal > policy.approval_required_above,
      note: "Derived from data, not from prompt text.",
    },
    {
      stage: "5 · Razorpay amount",
      authority: "payments.amount_minor + enforce_payment_amount() trigger",
      value: payment ? `${payment.amount_minor} paise (${inr(Number(payment.amount))})` : "not initialised",
      matches: payment ? Number(payment.amount_minor) === Math.round(orderFinal * 100) : null,
      note: "The database rejects any payment row whose amount differs from the order.",
    },
    {
      stage: "6 · Settlement",
      authority: "HMAC verification + signed webhook",
      value: payment ? String(payment.status) : "—",
      matches: null,
      note: "Only a verified signature or webhook can move an order to PAYMENT_CAPTURED → COMPLETED.",
    },
  ];

  return { order_id: order.id, currency: order.currency, rows, policy: base };
}

/* ----------------------- 6. user-scoped entry points ---------------------- */

/** Evidence for the demo merchant the caller owns (falls back to an empty set). */
export async function judgeEvidenceForUser(userId: string): Promise<JudgeEvidence | null> {
  const merchant = await ownedMerchant(userId);
  if (!merchant) return null;
  return collectJudgeEvidence(merchant.id);
}

export async function moneyProofForUser(userId: string): Promise<MoneyAuthorityProof | null> {
  const merchant = await ownedMerchant(userId);
  if (!merchant) return null;
  return buildMoneyAuthorityProof(merchant.id);
}
