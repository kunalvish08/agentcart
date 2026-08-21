// Phase 06 — server-authoritative Razorpay TEST MODE payment layer.
//
// SECURITY CONTRACT
// - The payment amount is ALWAYS orders.final_amount (converted to paise here and
//   re-checked by the database trigger enforce_payment_amount). No amount, price,
//   discount or currency is ever accepted from the browser, the AI model or Razorpay.
// - A payment only becomes VERIFIED after a server-side HMAC-SHA256 signature check
//   (checkout handler signature or raw-body webhook signature) AND, when possible, a
//   direct read of the payment from the Razorpay API.
// - An order only reaches COMPLETED through PAYMENT_CAPTURED, driven by a verified
//   payment event. The AI has no tool that can touch payments.
// - Duplicate webhooks and duplicate verifications are idempotent: unique indexes on
//   payments.order_id / razorpay_order_id / razorpay_payment_id and on
//   webhook_events(provider, event_id), plus state-guarded conditional updates.
// - Secrets are never persisted, returned or logged. webhook_events stores only a hash.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertTransition, type CheckoutState } from "@/lib/checkout-state";
import { assertPaymentTransition, type PaymentState } from "@/lib/payment-state";
import {
  createRazorpayOrder,
  fetchRazorpayOrderPayments,
  fetchRazorpayPayment,
  isRazorpayConfigured,
  mapRazorpayPaymentStatus,
  RazorpayApiError,
  RazorpayModeError,
  RazorpayNotConfiguredError,
  sha256Hex,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  type RazorpayPayment,
} from "@/lib/razorpay.server";

export type PaymentAuditEvent =
  | "PAYMENT_INITIALIZED"
  | "RAZORPAY_ORDER_CREATED"
  | "PAYMENT_AUTHORIZED"
  | "PAYMENT_CAPTURED"
  | "PAYMENT_VERIFIED"
  | "PAYMENT_FAILED"
  | "WEBHOOK_RECEIVED"
  | "WEBHOOK_DUPLICATE"
  | "WEBHOOK_REJECTED"
  | "ORDER_COMPLETED"
  | "RECONCILIATION_RUN";

export type PaymentSnapshot = {
  payment_id: string;
  order_id: string;
  order_status: CheckoutState;
  status: PaymentState;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  amount: number;
  amount_minor: number;
  currency: string;
  method: string | null;
  authorized_at: string | null;
  captured_at: string | null
  verified_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  mode: string;
};

export type PaymentFailure = {
  ok: false;
  error: { code: string; message: string; details?: Record<string, string | number | boolean> };
};

const fail = (
  code: string,
  message: string,
  details?: Record<string, string | number | boolean>,
): PaymentFailure => ({ ok: false, error: { code, message, ...(details ? { details } : {}) } });

/** Converts a provider/config error into a safe, secret-free failure. */
function safeProviderFailure(error: unknown): PaymentFailure {
  if (error instanceof RazorpayNotConfiguredError) {
    return fail("razorpay_not_configured", error.message);
  }
  if (error instanceof RazorpayModeError) return fail("razorpay_live_key_refused", error.message);
  if (error instanceof RazorpayApiError) {
    return fail("razorpay_api_error", error.message, { provider_status: error.status });
  }
  throw error;
}

async function writeAudit(entry: {
  orderId: string | null;
  merchantId: string;
  buyerSessionId?: string | null;
  event: PaymentAuditEvent;
  actorType: "ai_agent" | "merchant" | "system" | "buyer";
  actorId?: string | null;
  fromStatus?: CheckoutState | null;
  toStatus?: CheckoutState | null;
  reason?: string | null;
  decision?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from("checkout_audit_events").insert({
      order_id: entry.orderId,
      merchant_id: entry.merchantId,
      buyer_session_id: entry.buyerSessionId ?? null,
      event: entry.event as never,
      actor_type: entry.actorType,
      actor_id: entry.actorId ?? null,
      from_status: entry.fromStatus ?? null,
      to_status: entry.toStatus ?? null,
      reason: entry.reason ? entry.reason.slice(0, 500) : null,
      // Only non-sensitive, server-derived facts. Never a key, token or signature.
      policy_decision: (entry.decision ?? {}) as never,
    });
  } catch (error) {
    console.error("[payments] audit write failed", error);
  }
}

const ORDER_COLUMNS =
  "id, merchant_id, buyer_session_id, status, currency, final_amount, created_at, agent_sessions(user_id)";

type OrderRow = {
  id: string;
  merchant_id: string;
  buyer_session_id: string;
  status: CheckoutState;
  currency: string;
  final_amount: number | string;
  agent_sessions?: { user_id: string | null } | null;
};

async function loadOrder(orderId: string): Promise<OrderRow | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as OrderRow) ?? null;
}

/** Authoritative paise conversion. Rounds the persisted decimal, never client input. */
export function toPaise(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

async function paymentSnapshot(paymentId: string): Promise<PaymentSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("*, orders(status)")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Payment could not be loaded.");
  const row = data as unknown as Record<string, any>;
  return {
    payment_id: row["id"],
    order_id: row["order_id"],
    order_status: (row["orders"]?.status ?? "PAYMENT_PENDING") as CheckoutState,
    status: row["status"] as PaymentState,
    razorpay_order_id: row["razorpay_order_id"],
    razorpay_payment_id: row["razorpay_payment_id"] ?? null,
    amount: Number(row["amount"]),
    amount_minor: Number(row["amount_minor"]),
    currency: row["currency"],
    method: row["method"] ?? null,
    authorized_at: row["authorized_at"] ?? null,
    captured_at: row["captured_at"] ?? null,
    verified_at: row["verified_at"] ?? null,
    failure_reason: row["failure_reason"] ?? null,
    created_at: row["created_at"],
    updated_at: row["updated_at"],
    mode: row["mode"] ?? "test",
  };
}

/** State-guarded payment update: validated in TypeScript, enforced again by the DB trigger. */
async function movePayment(args: {
  paymentId: string;
  from: PaymentState;
  to: PaymentState;
  patch?: Record<string, unknown>;
}): Promise<boolean> {
  const next = assertPaymentTransition(args.from, args.to);
  const { data, error } = await supabaseAdmin
    .from("payments")
    .update({ status: next, ...(args.patch ?? {}) } as never)
    .eq("id", args.paymentId)
    .eq("status", args.from)
    .select("id");
  if (error) throw new Error(error.message);
  // Zero rows means another request already advanced this payment — never a second capture.
  return (data ?? []).length > 0;
}

async function moveOrder(args: {
  orderId: string;
  from: CheckoutState;
  to: CheckoutState;
}): Promise<boolean> {
  const next = assertTransition(args.from, args.to);
  const { data, error } = await supabaseAdmin
    .from("orders")
    .update({ status: next } as never)
    .eq("id", args.orderId)
    .eq("status", args.from)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/* --------------------------- 1. initialization --------------------------- */

export type InitPaymentResult =
  | {
      ok: true;
      already_initialized: boolean;
      /** Publishable key id only — the secret never leaves the server. */
      key_id: string;
      razorpay_order_id: string;
      amount: number;
      amount_minor: number;
      currency: string;
      order_id: string;
      payment_status: PaymentState;
      order_status: CheckoutState;
      mode: "test";
    }
  | PaymentFailure;

/**
 * Creates (or returns) the Razorpay test-mode order for one internal order.
 * The only input is an order id; identity, amount and currency are server-side.
 */
export async function initializePayment(args: {
  orderId: string;
  userId: string;
  actorType?: "buyer" | "merchant";
}): Promise<InitPaymentResult> {
  const order = await loadOrder(args.orderId);
  if (!order) return fail("order_not_found", "That order does not exist.");

  // Ownership: the buyer session behind the order must belong to the caller.
  if ((order.agent_sessions?.user_id ?? null) !== args.userId) {
    return fail("order_forbidden", "This order does not belong to your account.");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("payments")
    .select("id, status")
    .eq("order_id", order.id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing) {
    const snap = await paymentSnapshot(existing.id);
    if (!isRazorpayConfigured()) {
      return fail(
        "razorpay_not_configured",
        "Razorpay test credentials are not configured on the server yet.",
      );
    }
    const { getRazorpayConfig } = await import("@/lib/razorpay.server");
    return {
      ok: true,
      already_initialized: true,
      key_id: getRazorpayConfig().keyId,
      razorpay_order_id: snap.razorpay_order_id,
      amount: snap.amount,
      amount_minor: snap.amount_minor,
      currency: snap.currency,
      order_id: order.id,
      payment_status: snap.status,
      order_status: snap.order_status,
      mode: "test",
    };
  }

  if (order.status !== "PAYMENT_PENDING") {
    return fail(
      "invalid_order_state",
      `This order is ${order.status}; only an order awaiting payment can start a payment.`,
      { order_status: order.status },
    );
  }

  const amount = Number(order.final_amount);
  const amountMinor = toPaise(order.final_amount);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return fail("invalid_order_amount", "This order has no payable amount.");
  }

  let config: { keyId: string };
  let razorpayOrderId: string;
  try {
    const { getRazorpayConfig } = await import("@/lib/razorpay.server");
    config = getRazorpayConfig();
    const created = await createRazorpayOrder({
      amountMinor,
      currency: order.currency,
      receipt: order.id,
      notes: { internal_order_id: order.id, merchant_id: order.merchant_id, mode: "test" },
    });
    if (created.amount !== amountMinor || created.currency !== order.currency) {
      return fail(
        "razorpay_amount_mismatch",
        "The provider returned an amount that does not match this order, so payment was aborted.",
      );
    }
    razorpayOrderId = created.id;
  } catch (error) {
    await writeAudit({
      orderId: order.id,
      merchantId: order.merchant_id,
      buyerSessionId: order.buyer_session_id,
      event: "PAYMENT_FAILED",
      actorType: "system",
      reason: "Razorpay order creation failed.",
      decision: { stage: "razorpay_order_create" },
    });
    return safeProviderFailure(error);
  }

  await writeAudit({
    orderId: order.id,
    merchantId: order.merchant_id,
    buyerSessionId: order.buyer_session_id,
    event: "PAYMENT_INITIALIZED",
    actorType: args.actorType ?? "buyer",
    actorId: args.userId,
    reason: "Payment initialized from the authoritative order total.",
    decision: { amount_minor: amountMinor, currency: order.currency, mode: "test" },
  });

  const insert = await supabaseAdmin
    .from("payments")
    .insert({
      order_id: order.id,
      merchant_id: order.merchant_id,
      razorpay_order_id: razorpayOrderId,
      amount,
      amount_minor: amountMinor,
      currency: order.currency,
      status: "CREATED",
      mode: "test",
    } as never)
    .select("id")
    .maybeSingle();

  if (insert.error) {
    // Concurrent initialization: return the winner instead of a second payment.
    if (insert.error.code === "23505") {
      const { data: winner } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("order_id", order.id)
        .maybeSingle();
      if (winner) {
        const snap = await paymentSnapshot(winner.id);
        return {
          ok: true,
          already_initialized: true,
          key_id: config.keyId,
          razorpay_order_id: snap.razorpay_order_id,
          amount: snap.amount,
          amount_minor: snap.amount_minor,
          currency: snap.currency,
          order_id: order.id,
          payment_status: snap.status,
          order_status: snap.order_status,
          mode: "test",
        };
      }
    }
    throw new Error(insert.error.message);
  }

  const paymentId = insert.data!.id;
  await movePayment({ paymentId, from: "CREATED", to: "PENDING" });
  await writeAudit({
    orderId: order.id,
    merchantId: order.merchant_id,
    buyerSessionId: order.buyer_session_id,
    event: "RAZORPAY_ORDER_CREATED",
    actorType: "system",
    reason: "Razorpay test-mode order created.",
    decision: { razorpay_order_id: razorpayOrderId, amount_minor: amountMinor },
  });

  return {
    ok: true,
    already_initialized: false,
    key_id: config.keyId,
    razorpay_order_id: razorpayOrderId,
    amount,
    amount_minor: amountMinor,
    currency: order.currency,
    order_id: order.id,
    payment_status: "PENDING",
    order_status: order.status,
    mode: "test",
  };
}

/* --------------------- 2. capture / verify / fail core -------------------- */

type ProviderFacts = {
  razorpayPaymentId: string;
  status: "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED";
  method?: string | null;
  amountMinor: number;
  razorpayOrderId: string | null;
  failureReason?: string | null;
};

/**
 * The single funnel through which a verified provider fact changes state.
 * Idempotent by construction: every step is a guarded conditional update.
 */
async function applyVerifiedPayment(args: {
  paymentRowId: string;
  facts: ProviderFacts;
  source: "client_verification" | "webhook" | "reconciliation";
  actorId?: string | null;
}): Promise<{ ok: true; payment: PaymentSnapshot; changed: boolean } | PaymentFailure> {
  const snap = await paymentSnapshot(args.paymentRowId);
  const order = await loadOrder(snap.order_id);
  if (!order) return fail("order_not_found", "That order does not exist.");

  // Amount integrity — the provider must agree with our authoritative total.
  if (args.facts.amountMinor !== snap.amount_minor) {
    await writeAudit({
      orderId: order.id,
      merchantId: order.merchant_id,
      buyerSessionId: order.buyer_session_id,
      event: "PAYMENT_FAILED",
      actorType: "system",
      reason: "Provider amount did not match the authoritative order total.",
      decision: {
        expected_minor: snap.amount_minor,
        provider_minor: args.facts.amountMinor,
        source: args.source,
      },
    });
    return fail(
      "amount_mismatch",
      "The payment amount does not match the order total, so it was rejected.",
    );
  }
  if (args.facts.razorpayOrderId && args.facts.razorpayOrderId !== snap.razorpay_order_id) {
    return fail("razorpay_order_mismatch", "That payment belongs to a different Razorpay order.");
  }

  const audit = (event: PaymentAuditEvent, reason: string, decision: Record<string, unknown>) =>
    writeAudit({
      orderId: order.id,
      merchantId: order.merchant_id,
      buyerSessionId: order.buyer_session_id,
      event,
      actorType: "system",
      actorId: args.actorId ?? null,
      reason,
      decision: { ...decision, source: args.source },
    });

  let changed = false;
  let current = snap.status;

  if (args.facts.status === "FAILED") {
    if (current === "FAILED") return { ok: true, payment: snap, changed: false };
    if (!["CREATED", "PENDING", "AUTHORIZED"].includes(current)) {
      return fail(
        "invalid_payment_transition",
        `A ${current} payment cannot be marked FAILED.`,
        { payment_status: current },
      );
    }
    changed = await movePayment({
      paymentId: snap.payment_id,
      from: current,
      to: "FAILED",
      patch: {
        razorpay_payment_id: args.facts.razorpayPaymentId,
        method: args.facts.method ?? null,
        failed_at: new Date().toISOString(),
        failure_reason: (args.facts.failureReason ?? "Payment failed at the provider.").slice(0, 500),
      },
    });
    if (changed) {
      await audit("PAYMENT_FAILED", "Payment failed at the provider. The order stays unpaid.", {
        razorpay_payment_id: args.facts.razorpayPaymentId,
      });
    }
    return { ok: true, payment: await paymentSnapshot(snap.payment_id), changed };
  }

  if (args.facts.status === "AUTHORIZED" && ["CREATED", "PENDING"].includes(current)) {
    if (
      await movePayment({
        paymentId: snap.payment_id,
        from: current,
        to: "AUTHORIZED",
        patch: {
          razorpay_payment_id: args.facts.razorpayPaymentId,
          method: args.facts.method ?? null,
          authorized_at: new Date().toISOString(),
        },
      })
    ) {
      changed = true;
      current = "AUTHORIZED";
      await audit("PAYMENT_AUTHORIZED", "Payment authorized at the provider.", {
        razorpay_payment_id: args.facts.razorpayPaymentId,
      });
    }
  }

  if (args.facts.status === "CAPTURED") {
    if (["CREATED", "PENDING", "AUTHORIZED"].includes(current)) {
      if (
        await movePayment({
          paymentId: snap.payment_id,
          from: current,
          to: "CAPTURED",
          patch: {
            razorpay_payment_id: args.facts.razorpayPaymentId,
            method: args.facts.method ?? null,
            captured_at: new Date().toISOString(),
          },
        })
      ) {
        changed = true;
        current = "CAPTURED";
        await audit("PAYMENT_CAPTURED", "Payment captured and matched to the order total.", {
          razorpay_payment_id: args.facts.razorpayPaymentId,
          amount_minor: snap.amount_minor,
        });
        if (order.status === "PAYMENT_PENDING") {
          await moveOrder({ orderId: order.id, from: "PAYMENT_PENDING", to: "PAYMENT_CAPTURED" });
          await audit("PAYMENT_CAPTURED", "Order moved to PAYMENT_CAPTURED.", {
            from_status: "PAYMENT_PENDING",
          });
        }
      } else {
        current = (await paymentSnapshot(snap.payment_id)).status;
      }
    }

    // Verification is the only gate to COMPLETED, and it is idempotent.
    if (current === "CAPTURED") {
      if (
        await movePayment({
          paymentId: snap.payment_id,
          from: "CAPTURED",
          to: "VERIFIED",
          patch: { verified_at: new Date().toISOString() },
        })
      ) {
        changed = true;
        current = "VERIFIED";
        await audit("PAYMENT_VERIFIED", "Payment signature and provider state verified server-side.", {
          razorpay_payment_id: args.facts.razorpayPaymentId,
        });
      }
    }

    if (current === "VERIFIED") {
      const fresh = await loadOrder(order.id);
      if (fresh?.status === "PAYMENT_CAPTURED") {
        if (await moveOrder({ orderId: order.id, from: "PAYMENT_CAPTURED", to: "COMPLETED" })) {
          changed = true;
          await audit("ORDER_COMPLETED", "Order completed after verified payment.", {
            from_status: "PAYMENT_CAPTURED",
          });
        }
      }
    }
  }

  return { ok: true, payment: await paymentSnapshot(snap.payment_id), changed };
}

/* ----------------------- 3. client-side verification ---------------------- */

export type VerifyPaymentResult =
  | { ok: true; verified: boolean; payment: PaymentSnapshot; order_status: CheckoutState }
  | PaymentFailure;

/**
 * Called after Razorpay Checkout reports success in the browser. The browser's
 * claim proves nothing: the signature is re-computed here and the payment is read
 * back from Razorpay before any state moves.
 */
export async function verifyClientPayment(args: {
  orderId: string;
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): Promise<VerifyPaymentResult> {
  const order = await loadOrder(args.orderId);
  if (!order) return fail("order_not_found", "That order does not exist.");
  if ((order.agent_sessions?.user_id ?? null) !== args.userId) {
    return fail("order_forbidden", "This order does not belong to your account.");
  }

  const { data: payment, error } = await supabaseAdmin
    .from("payments")
    .select("id, razorpay_order_id, status")
    .eq("order_id", order.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!payment) return fail("payment_not_initialized", "This order has no payment attempt yet.");

  if (payment.razorpay_order_id !== args.razorpayOrderId) {
    return fail("razorpay_order_mismatch", "That Razorpay order does not belong to this order.");
  }

  // Already verified — idempotent success, no second capture.
  if (payment.status === "VERIFIED") {
    const snap = await paymentSnapshot(payment.id);
    return { ok: true, verified: true, payment: snap, order_status: snap.order_status };
  }

  let signatureOk: boolean;
  try {
    signatureOk = await verifyCheckoutSignature({
      razorpayOrderId: args.razorpayOrderId,
      razorpayPaymentId: args.razorpayPaymentId,
      signature: args.signature,
    });
  } catch (error) {
    return safeProviderFailure(error);
  }

  if (!signatureOk) {
    await writeAudit({
      orderId: order.id,
      merchantId: order.merchant_id,
      buyerSessionId: order.buyer_session_id,
      event: "WEBHOOK_REJECTED",
      actorType: "buyer",
      actorId: args.userId,
      reason: "Client-reported payment rejected: signature verification failed.",
      decision: { stage: "client_verification" },
    });
    return fail(
      "signature_verification_failed",
      "That payment could not be verified, so the order was not marked as paid.",
    );
  }

  // Signature valid — still confirm the provider's own view of the payment.
  let provider: RazorpayPayment;
  try {
    provider = await fetchRazorpayPayment(args.razorpayPaymentId);
  } catch (error) {
    return safeProviderFailure(error);
  }

  const applied = await applyVerifiedPayment({
    paymentRowId: payment.id,
    source: "client_verification",
    actorId: args.userId,
    facts: {
      razorpayPaymentId: provider.id,
      status: mapRazorpayPaymentStatus(provider.status),
      method: provider.method ?? null,
      amountMinor: Number(provider.amount),
      razorpayOrderId: provider.order_id ?? null,
      failureReason: provider.error_description ?? provider.error_reason ?? null,
    },
  });
  if (!applied.ok) return applied;

  return {
    ok: true,
    verified: applied.payment.status === "VERIFIED",
    payment: applied.payment,
    order_status: applied.payment.order_status,
  };
}

/* ------------------------------ 4. webhook ------------------------------- */

export type WebhookResult = {
  status: number;
  body: { ok: boolean; status: string; reason?: string };
};

/**
 * Verifies the RAW body signature, records the event for idempotency, then applies
 * the provider fact. A duplicate delivery is acknowledged without re-processing.
 */
export async function handleRazorpayWebhook(args: {
  rawBody: string;
  signature: string | null;
  deliveryId: string | null;
}): Promise<WebhookResult> {
  const payloadHash = await sha256Hex(args.rawBody);

  let signatureOk = false;
  try {
    signatureOk = args.signature
      ? await verifyWebhookSignature(args.rawBody, args.signature)
      : false;
  } catch (error) {
    if (error instanceof RazorpayNotConfiguredError) {
      console.error("[payments] webhook rejected: webhook secret not configured");
      return { status: 503, body: { ok: false, status: "not_configured" } };
    }
    throw error;
  }

  if (!signatureOk) {
    // No state mutation whatsoever; record the rejection without the payload.
    await supabaseAdmin.from("webhook_events").insert({
      event_id: `rejected:${payloadHash}:${Date.now()}`,
      event_type: "unverified",
      status: "rejected",
      payload_hash: payloadHash,
      error: "signature verification failed",
    } as never);
    console.error("[payments] webhook signature verification failed");
    return { status: 401, body: { ok: false, status: "invalid_signature" } };
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(args.rawBody) as Record<string, any>;
  } catch {
    return { status: 400, body: { ok: false, status: "invalid_json" } };
  }

  const eventType = String(payload["event"] ?? "unknown");
  const entity =
    (payload["payload"]?.["payment"]?.["entity"] as RazorpayPayment | undefined) ?? undefined;
  const eventId = args.deliveryId ?? `${eventType}:${entity?.id ?? payloadHash}`;

  // Idempotency: the unique index makes a duplicate insert fail, and we acknowledge it.
  const claim = await supabaseAdmin
    .from("webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      status: "processing",
      payload_hash: payloadHash,
    } as never)
    .select("id")
    .maybeSingle();

  if (claim.error) {
    if (claim.error.code === "23505") {
      const { data: prior } = await supabaseAdmin
        .from("webhook_events")
        .select("id, order_id, status")
        .eq("provider", "razorpay")
        .eq("event_id", eventId)
        .maybeSingle();
      if (prior?.order_id) {
        const { data: ord } = await supabaseAdmin
          .from("orders")
          .select("merchant_id, buyer_session_id")
          .eq("id", prior.order_id)
          .maybeSingle();
        if (ord) {
          await writeAudit({
            orderId: prior.order_id,
            merchantId: ord.merchant_id,
            buyerSessionId: ord.buyer_session_id,
            event: "WEBHOOK_DUPLICATE",
            actorType: "system",
            reason: `Duplicate ${eventType} delivery acknowledged without reprocessing.`,
            decision: { event_id: eventId },
          });
        }
      }
      return { status: 200, body: { ok: true, status: "duplicate" } };
    }
    throw new Error(claim.error.message);
  }

  const webhookRowId = claim.data!.id;
  const finish = async (
    status: "processed" | "ignored" | "failed",
    extra: { orderId?: string | null; paymentId?: string | null; error?: string | null } = {},
  ) => {
    await supabaseAdmin
      .from("webhook_events")
      .update({
        status,
        processed_at: new Date().toISOString(),
        order_id: extra.orderId ?? null,
        payment_id: extra.paymentId ?? null,
        error: extra.error ? extra.error.slice(0, 500) : null,
      } as never)
      .eq("id", webhookRowId);
  };

  const handled = [
    "payment.authorized",
    "payment.captured",
    "payment.failed",
    "order.paid",
  ].includes(eventType);
  if (!handled || !entity?.id) {
    await finish("ignored");
    return { status: 200, body: { ok: true, status: "ignored" } };
  }

  const razorpayOrderId = entity.order_id ?? null;
  const { data: payment, error: paymentError } = await supabaseAdmin
    .from("payments")
    .select("id, order_id")
    .eq("razorpay_order_id", razorpayOrderId ?? "")
    .maybeSingle();
  if (paymentError) throw new Error(paymentError.message);

  if (!payment) {
    // Unknown payment: quarantine safely, mutate nothing.
    await finish("ignored", { error: "unknown razorpay order" });
    return { status: 200, body: { ok: true, status: "unknown_order" } };
  }

  const order = await loadOrder(payment.order_id);
  if (order) {
    await writeAudit({
      orderId: order.id,
      merchantId: order.merchant_id,
      buyerSessionId: order.buyer_session_id,
      event: "WEBHOOK_RECEIVED",
      actorType: "system",
      reason: `Verified ${eventType} webhook received.`,
      decision: { event_id: eventId, event_type: eventType },
    });
  }

  const applied = await applyVerifiedPayment({
    paymentRowId: payment.id,
    source: "webhook",
    facts: {
      razorpayPaymentId: entity.id,
      status: mapRazorpayPaymentStatus(String(entity.status)),
      method: entity.method ?? null,
      amountMinor: Number(entity.amount),
      razorpayOrderId,
      failureReason: entity.error_description ?? entity.error_reason ?? null,
    },
  });

  if (!applied.ok) {
    await finish("failed", {
      orderId: payment.order_id,
      paymentId: payment.id,
      error: applied.error.code,
    });
    // Acknowledge: retrying will not change a deterministic rejection.
    return { status: 200, body: { ok: false, status: applied.error.code } };
  }

  await finish("processed", { orderId: payment.order_id, paymentId: payment.id });
  return { status: 200, body: { ok: true, status: applied.changed ? "processed" : "no_change" } };
}

/* --------------------------- 5. reconciliation --------------------------- */

export type ReconciliationRow = {
  order_id: string;
  payment_id: string;
  before: PaymentState;
  after: PaymentState;
  order_status: CheckoutState;
  changed: boolean;
  note: string;
};

export type ReconciliationResult =
  | { ok: true; checked: number; updated: number; rows: ReconciliationRow[] }
  | PaymentFailure;

/**
 * Compares stuck local payments against Razorpay's test-mode API. Read-only at the
 * provider: it never captures, refunds or retries a charge. Fully idempotent.
 */
export async function reconcilePayments(args: {
  merchantId: string;
  reviewerId: string;
  orderId?: string | null;
}): Promise<ReconciliationResult> {
  if (!isRazorpayConfigured()) {
    return fail(
      "razorpay_not_configured",
      "Razorpay test credentials are not configured on the server yet.",
    );
  }

  let query = supabaseAdmin
    .from("payments")
    .select("id, order_id, razorpay_order_id, status")
    .eq("merchant_id", args.merchantId)
    .in("status", ["CREATED", "PENDING", "AUTHORIZED"])
    .order("created_at", { ascending: true })
    .limit(25);
  if (args.orderId) query = query.eq("order_id", args.orderId);

  const { data: stuck, error } = await query;
  if (error) throw new Error(error.message);

  const rows: ReconciliationRow[] = [];
  let updated = 0;

  for (const candidate of stuck ?? []) {
    let providerPayments: RazorpayPayment[] = [];
    try {
      providerPayments = (await fetchRazorpayOrderPayments(candidate.razorpay_order_id)).items ?? [];
    } catch (error) {
      if (error instanceof RazorpayApiError) {
        rows.push({
          order_id: candidate.order_id,
          payment_id: candidate.id,
          before: candidate.status as PaymentState,
          after: candidate.status as PaymentState,
          order_status: "PAYMENT_PENDING",
          changed: false,
          note: `Provider lookup failed (${error.status}).`,
        });
        continue;
      }
      throw error;
    }

    const relevant =
      providerPayments.find((p) => p.status === "captured") ??
      providerPayments.find((p) => p.status === "authorized") ??
      providerPayments.find((p) => p.status === "failed") ??
      null;

    if (!relevant) {
      rows.push({
        order_id: candidate.order_id,
        payment_id: candidate.id,
        before: candidate.status as PaymentState,
        after: candidate.status as PaymentState,
        order_status: "PAYMENT_PENDING",
        changed: false,
        note: "No provider payment yet — still pending.",
      });
      continue;
    }

    const applied = await applyVerifiedPayment({
      paymentRowId: candidate.id,
      source: "reconciliation",
      actorId: args.reviewerId,
      facts: {
        razorpayPaymentId: relevant.id,
        status: mapRazorpayPaymentStatus(relevant.status),
        method: relevant.method ?? null,
        amountMinor: Number(relevant.amount),
        razorpayOrderId: relevant.order_id ?? null,
        failureReason: relevant.error_description ?? relevant.error_reason ?? null,
      },
    });

    if (!applied.ok) {
      rows.push({
        order_id: candidate.order_id,
        payment_id: candidate.id,
        before: candidate.status as PaymentState,
        after: candidate.status as PaymentState,
        order_status: "PAYMENT_PENDING",
        changed: false,
        note: applied.error.message,
      });
      continue;
    }

    if (applied.changed) updated += 1;
    rows.push({
      order_id: candidate.order_id,
      payment_id: candidate.id,
      before: candidate.status as PaymentState,
      after: applied.payment.status,
      order_status: applied.payment.order_status,
      changed: applied.changed,
      note: applied.changed ? "Reconciled against the provider." : "Already up to date.",
    });
  }

  await writeAudit({
    orderId: args.orderId ?? null,
    merchantId: args.merchantId,
    event: "RECONCILIATION_RUN",
    actorType: "merchant",
    actorId: args.reviewerId,
    reason: `Reconciliation checked ${rows.length} pending payment(s); ${updated} updated.`,
    decision: { checked: rows.length, updated },
  });

  return { ok: true, checked: rows.length, updated, rows };
}

export async function getPaymentForOrder(orderId: string): Promise<PaymentSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return paymentSnapshot(data.id);
}
