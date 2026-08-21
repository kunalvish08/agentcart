// Phase 05 — server-authoritative agentic checkout.
//
// SECURITY CONTRACT
// - No monetary value ever comes from the client or the model. Every amount on
//   an order is copied from the persisted quote row in PostgreSQL.
// - The approval decision is derived from merchant_policies.approval_required_above
//   only. Neither the AI nor the buyer can set, skip or override it.
// - Approvals are performed by an authenticated merchant owner through
//   reviewApproval(); the tool layer has no approve capability at all.
// - Status changes go through the deterministic state machine in
//   @/lib/checkout-state, which is mirrored by a database trigger.
// - Inventory is validated, never silently decremented (no reservation in Phase 05).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  assertTransition,
  type CheckoutState,
} from "@/lib/checkout-state";
import { getPolicy } from "@/lib/public-api.server";

export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;
export const ORDER_TTL_HOURS = 24;

export type CheckoutTraceEntry = { label: string; ok: boolean };

export type CheckoutErrorDetails = Record<string, string | number | boolean>;

export type OrderSnapshot = {
  order_id: string;
  status: CheckoutState;
  merchant: string;
  currency: string;
  product_id: string;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  subtotal_amount: number;
  discount_amount: number;
  discount_percent: number;
  final_amount: number;
  approval_required: boolean;
  approval_reason: string | null;
  approval_status: "pending" | "approved" | "rejected" | null;
  quote_id: string;
  idempotency_key: string;
  created_at: string;
  expires_at: string;
  approved_at: string | null;
  payment_state: "not_started";
};

export type CheckoutResult =
  | { ok: true; idempotent_replay: boolean; order: OrderSnapshot; trace: CheckoutTraceEntry[] }
  | {
      ok: false;
      error: { code: string; message: string; details?: CheckoutErrorDetails };
      trace: CheckoutTraceEntry[];
    };

type AuditActor = "ai_agent" | "merchant" | "system" | "buyer";

async function writeAudit(entry: {
  orderId: string | null;
  merchantId: string;
  buyerSessionId: string | null;
  event:
    | "CHECKOUT_REQUESTED"
    | "APPROVAL_REQUIRED"
    | "APPROVED"
    | "REJECTED"
    | "ORDER_CREATED"
    | "PAYMENT_PENDING"
    | "CHECKOUT_FAILED"
    | "CANCELLED"
    | "EXPIRED";
  actorType: AuditActor;
  actorId?: string | null;
  fromStatus?: CheckoutState | null;
  toStatus?: CheckoutState | null;
  reason?: string | null;
  policyDecision?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin.from("checkout_audit_events").insert({
      order_id: entry.orderId,
      merchant_id: entry.merchantId,
      buyer_session_id: entry.buyerSessionId,
      event: entry.event,
      actor_type: entry.actorType,
      // Never a secret: an opaque user/session identifier only.
      actor_id: entry.actorId ?? null,
      from_status: entry.fromStatus ?? null,
      to_status: entry.toStatus ?? null,
      reason: entry.reason ? entry.reason.slice(0, 500) : null,
      policy_decision: (entry.policyDecision ?? {}) as never,
    });
  } catch (error) {
    console.error("[checkout] audit write failed", error);
  }
}

/** Server-side status change: validated by the state machine, then persisted. */
async function transition(args: {
  orderId: string;
  from: CheckoutState;
  to: CheckoutState;
  patch?: Record<string, unknown>;
}): Promise<CheckoutState> {
  const next = assertTransition(args.from, args.to);
  const { error } = await supabaseAdmin
    .from("orders")
    .update({ status: next, ...(args.patch ?? {}) } as never)
    .eq("id", args.orderId)
    .eq("status", args.from);
  if (error) throw new Error(error.message);
  return next;
}

async function snapshot(orderId: string): Promise<OrderSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, status, currency, quote_id, idempotency_key, subtotal_amount, discount_amount, final_amount, approval_required, approval_reason, created_at, expires_at, approved_at, merchant_id, merchants(slug), order_items(product_id, quantity, unit_price, discount_amount, final_unit_price, products(name)), checkout_approvals(status)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as Record<string, any>;
  const item = (row["order_items"] ?? [])[0] ?? null;
  const subtotal = Number(row["subtotal_amount"] ?? 0);
  const discount = Number(row["discount_amount"] ?? 0);
  const approval = (row["checkout_approvals"] ?? [])[0] ?? null;

  return {
    order_id: row["id"],
    status: row["status"] as CheckoutState,
    merchant: row["merchants"]?.slug ?? "",
    currency: row["currency"],
    product_id: item?.product_id ?? "",
    product_name: item?.products?.name ?? null,
    quantity: Number(item?.quantity ?? 0),
    unit_price: Number(item?.unit_price ?? 0),
    subtotal_amount: subtotal,
    discount_amount: discount,
    discount_percent: subtotal > 0 ? Number(((discount / subtotal) * 100).toFixed(2)) : 0,
    final_amount: Number(row["final_amount"] ?? 0),
    approval_required: Boolean(row["approval_required"]),
    approval_reason: row["approval_reason"] ?? null,
    approval_status: (approval?.status ?? null) as OrderSnapshot["approval_status"],
    quote_id: row["quote_id"],
    idempotency_key: row["idempotency_key"],
    created_at: row["created_at"],
    expires_at: row["expires_at"],
    approved_at: row["approved_at"] ?? null,
    payment_state: "not_started",
  };
}

async function findExistingOrder(args: {
  merchantId: string;
  buyerSessionId: string;
  idempotencyKey?: string;
  quoteId?: string;
}) {
  let query = supabaseAdmin
    .from("orders")
    .select("id")
    .eq("merchant_id", args.merchantId)
    .eq("buyer_session_id", args.buyerSessionId);
  query = args.idempotencyKey
    ? query.eq("idempotency_key", args.idempotencyKey)
    : query.eq("quote_id", args.quoteId!);
  const { data, error } = await query.maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data?.id ?? null;
}

/**
 * The one and only way an order is created.
 *
 * The caller supplies nothing but a quote_id and an idempotency key: identity
 * (merchant, buyer session) is resolved server-side, and every amount is copied
 * from the persisted quote.
 */
export async function requestCheckout(args: {
  quoteId: string;
  idempotencyKey: string;
  buyerSessionId: string;
  /** Authenticated user that owns the buyer session (verified by the caller). */
  userId: string;
  actorType: "ai_agent" | "buyer";
  customerRequestSummary?: string | null;
}): Promise<CheckoutResult> {
  const trace: CheckoutTraceEntry[] = [];
  const add = (label: string, ok = true) => {
    trace.push({ label, ok });
  };

  if (!IDEMPOTENCY_KEY_RE.test(args.idempotencyKey)) {
    return {
      ok: false,
      trace,
      error: {
        code: "invalid_idempotency_key",
        message: "idempotency_key must be 8-128 characters of letters, digits, '-' or '_'.",
      },
    };
  }

  // --- session ownership (the buyer session ties the order to a real user) ---
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("agent_sessions")
    .select("id, user_id, merchant_id")
    .eq("id", args.buyerSessionId)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session || session.user_id !== args.userId) {
    return {
      ok: false,
      trace,
      error: { code: "session_not_found", message: "No buyer session is available for checkout." },
    };
  }

  // --- authoritative quote ---
  const { data: quote, error: quoteError } = await supabaseAdmin
    .from("quotes")
    .select(
      "id, merchant_id, product_id, quantity, unit_price, base_amount, requested_discount_percent, allowed_discount_percent, final_amount, currency, policy_reason, expires_at, merchants(slug, status, agent_commerce_enabled)",
    )
    .eq("id", args.quoteId)
    .maybeSingle();
  if (quoteError) throw new Error(quoteError.message);
  if (!quote) {
    return {
      ok: false,
      trace,
      error: { code: "quote_not_found", message: "That quote does not exist." },
    };
  }
  if (quote.merchant_id !== session.merchant_id) {
    return {
      ok: false,
      trace,
      error: {
        code: "quote_merchant_mismatch",
        message: "That quote belongs to a different merchant than this buyer session.",
      },
    };
  }
  add("Quote verified");

  const merchantId = quote.merchant_id;
  const merchantSlug = (quote as unknown as Record<string, any>)["merchants"]?.slug ?? "";

  const failWith = async (code: string, message: string, details?: CheckoutErrorDetails) => {
    add(`Checkout failed (${code})`, false);
    await writeAudit({
      orderId: null,
      merchantId,
      buyerSessionId: args.buyerSessionId,
      event: "CHECKOUT_FAILED",
      actorType: args.actorType,
      actorId: args.userId,
      reason: message,
      policyDecision: { code, ...(details ? { details } : {}) },
    });
    return {
      ok: false as const,
      trace,
      error: { code, message, ...(details ? { details } : {}) },
    };
  };

  // --- idempotency: same merchant + session + key returns the existing order ---
  const replayId = await findExistingOrder({
    merchantId,
    buyerSessionId: args.buyerSessionId,
    idempotencyKey: args.idempotencyKey,
  });
  if (replayId) {
    const existing = await snapshot(replayId);
    if (existing) {
      add("Idempotent replay — existing order returned");
      return { ok: true, idempotent_replay: true, order: existing, trace };
    }
  }

  // A quote is single-use: a different key must not create a second order for it.
  const quoteOrderId = await findExistingOrder({
    merchantId,
    buyerSessionId: args.buyerSessionId,
    quoteId: quote.id,
  });
  if (quoteOrderId) {
    const existing = await snapshot(quoteOrderId);
    if (existing) {
      add("Quote already checked out — existing order returned");
      return { ok: true, idempotent_replay: true, order: existing, trace };
    }
  }

  if (new Date(quote.expires_at).getTime() <= Date.now()) {
    return failWith("quote_expired", "That quote has expired. Request a fresh quote to continue.", {
      expires_at: quote.expires_at,
    });
  }
  add("Quote validity confirmed");

  // --- product + inventory validation (validation only, no stock mutation) ---
  const { data: product, error: productError } = await supabaseAdmin
    .from("products")
    .select("id, name, status, stock_quantity, price")
    .eq("id", quote.product_id)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (productError) throw new Error(productError.message);
  if (!product) return failWith("product_not_found", "The quoted product is no longer available.");
  if (product.status !== "active") {
    return failWith("product_inactive", "The quoted product is no longer available for sale.");
  }
  if (product.stock_quantity < quote.quantity) {
    return failWith("insufficient_inventory", "There is not enough stock to complete this checkout.", {
      requested_quantity: quote.quantity,
      available_quantity: product.stock_quantity,
    });
  }
  add(`Inventory checked — ${product.stock_quantity} in stock`);

  // --- merchant policy re-check at checkout time ---
  const policy = await getPolicy(merchantId);
  const subtotal = Number(quote.base_amount);
  const finalAmount = Number(quote.final_amount);
  const discountAmount = Number((subtotal - finalAmount).toFixed(2));
  const allowedDiscount = Number(quote.allowed_discount_percent);

  const policyCap = policy.allow_negotiation ? policy.max_discount_percent : 0;
  if (allowedDiscount > policyCap + 1e-9) {
    return failWith(
      "discount_exceeds_policy",
      "The quoted discount is above the merchant's current policy limit, so checkout is refused.",
      { quoted_discount_percent: allowedDiscount, policy_limit_percent: policyCap },
    );
  }
  if (policy.max_order_value > 0 && finalAmount > policy.max_order_value) {
    return failWith(
      "order_value_exceeded",
      "This order exceeds the merchant's maximum order value, so checkout is refused.",
      { final_amount: finalAmount, max_order_value: policy.max_order_value },
    );
  }
  add(`Merchant policy checked — max discount ${policyCap}%`);

  // --- approval decision: server-derived, never client- or model-supplied ---
  const approvalRequired =
    policy.approval_required_above > 0 && finalAmount > policy.approval_required_above;
  const approvalReason = approvalRequired
    ? `Order value ${finalAmount} ${quote.currency} exceeds the merchant's automatic approval threshold of ${policy.approval_required_above} ${quote.currency}.`
    : `Order value ${finalAmount} ${quote.currency} is within the merchant's automatic approval threshold of ${policy.approval_required_above} ${quote.currency}.`;

  const negotiationSummary = await summarizeNegotiation(args.buyerSessionId, quote.product_id);

  // --- create the order (all money copied from the quote row) ---
  const insert = await supabaseAdmin
    .from("orders")
    .insert({
      merchant_id: merchantId,
      buyer_session_id: args.buyerSessionId,
      quote_id: quote.id,
      idempotency_key: args.idempotencyKey,
      status: "CHECKOUT_REQUESTED",
      currency: quote.currency,
      subtotal_amount: subtotal,
      discount_amount: discountAmount,
      final_amount: finalAmount,
      approval_required: approvalRequired,
      approval_reason: approvalReason,
      customer_request_summary: (args.customerRequestSummary ?? "").slice(0, 500) || null,
      negotiation_summary: negotiationSummary,
      policy_snapshot: {
        max_discount_percent: policy.max_discount_percent,
        max_order_value: policy.max_order_value,
        approval_required_above: policy.approval_required_above,
        allow_negotiation: policy.allow_negotiation,
        quoted_discount_percent: allowedDiscount,
        requested_discount_percent: Number(quote.requested_discount_percent),
      } as never,
      expires_at: new Date(Date.now() + ORDER_TTL_HOURS * 3_600_000).toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (insert.error) {
    // Unique violation = concurrent duplicate: return the winner, never a second order.
    if (insert.error.code === "23505") {
      const winner = await findExistingOrder({
        merchantId,
        buyerSessionId: args.buyerSessionId,
        idempotencyKey: args.idempotencyKey,
      });
      const existing = winner ? await snapshot(winner) : null;
      if (existing) {
        add("Idempotent replay — existing order returned");
        return { ok: true, idempotent_replay: true, order: existing, trace };
      }
    }
    throw new Error(insert.error.message);
  }
  const orderId = insert.data!.id;
  add("Checkout requested");

  await supabaseAdmin.from("order_items").insert({
    order_id: orderId,
    product_id: product.id,
    quantity: quote.quantity,
    unit_price: Number(quote.unit_price),
    discount_amount: discountAmount,
    final_unit_price: Number((finalAmount / quote.quantity).toFixed(2)),
  });

  await writeAudit({
    orderId,
    merchantId,
    buyerSessionId: args.buyerSessionId,
    event: "CHECKOUT_REQUESTED",
    actorType: args.actorType,
    actorId: args.userId,
    toStatus: "CHECKOUT_REQUESTED",
    reason: args.customerRequestSummary?.slice(0, 300) ?? "Checkout requested for a verified quote.",
    policyDecision: {
      final_amount: finalAmount,
      discount_percent: allowedDiscount,
      approval_required_above: policy.approval_required_above,
    },
  });

  if (approvalRequired) {
    await transition({ orderId, from: "CHECKOUT_REQUESTED", to: "APPROVAL_REQUIRED" });
    await supabaseAdmin.from("checkout_approvals").insert({
      order_id: orderId,
      merchant_id: merchantId,
      status: "pending",
      reason: approvalReason,
    });
    await writeAudit({
      orderId,
      merchantId,
      buyerSessionId: args.buyerSessionId,
      event: "APPROVAL_REQUIRED",
      actorType: "system",
      fromStatus: "CHECKOUT_REQUESTED",
      toStatus: "APPROVAL_REQUIRED",
      reason: approvalReason,
      policyDecision: {
        final_amount: finalAmount,
        approval_required_above: policy.approval_required_above,
      },
    });
    add("Approval required — waiting for merchant");
  } else {
    let state = await transition({
      orderId,
      from: "CHECKOUT_REQUESTED",
      to: "APPROVED",
      patch: { approved_at: new Date().toISOString() },
    });
    await writeAudit({
      orderId,
      merchantId,
      buyerSessionId: args.buyerSessionId,
      event: "APPROVED",
      actorType: "system",
      fromStatus: "CHECKOUT_REQUESTED",
      toStatus: "APPROVED",
      reason: approvalReason,
      policyDecision: {
        auto_approved: true,
        approval_required_above: policy.approval_required_above,
      },
    });
    add("Automatically approved under merchant policy");
    state = await finalizeApprovedOrder({
      orderId,
      merchantId,
      buyerSessionId: args.buyerSessionId,
      from: state,
      add,
    });
    void state;
  }

  const order = await snapshot(orderId);
  if (!order) throw new Error("Order could not be loaded after creation.");
  return { ok: true, idempotent_replay: false, order, trace };
}

/** APPROVED -> ORDER_CREATED -> PAYMENT_PENDING. Phase 05 stops here. */
async function finalizeApprovedOrder(args: {
  orderId: string;
  merchantId: string;
  buyerSessionId: string;
  from: CheckoutState;
  add?: (label: string, ok?: boolean) => void;
}): Promise<CheckoutState> {
  let state = await transition({ orderId: args.orderId, from: args.from, to: "ORDER_CREATED" });
  await writeAudit({
    orderId: args.orderId,
    merchantId: args.merchantId,
    buyerSessionId: args.buyerSessionId,
    event: "ORDER_CREATED",
    actorType: "system",
    fromStatus: args.from,
    toStatus: "ORDER_CREATED",
    reason: "Order created from the authoritative quote.",
  });
  args.add?.("Order created");

  state = await transition({ orderId: args.orderId, from: state, to: "PAYMENT_PENDING" });
  await writeAudit({
    orderId: args.orderId,
    merchantId: args.merchantId,
    buyerSessionId: args.buyerSessionId,
    event: "PAYMENT_PENDING",
    actorType: "system",
    fromStatus: "ORDER_CREATED",
    toStatus: "PAYMENT_PENDING",
    reason: "Awaiting payment. Payment capture is not part of this phase.",
  });
  args.add?.("Payment pending");
  return state;
}

export type ApprovalDecisionResult =
  | { ok: true; order: OrderSnapshot }
  | { ok: false; error: { code: string; message: string } };

/**
 * Human-in-the-loop review. Only reachable from an authenticated server function
 * after the caller has been confirmed as the owner of the merchant.
 */
export async function reviewApproval(args: {
  orderId: string;
  merchantId: string;
  reviewerId: string;
  decision: "approve" | "reject";
  rejectionReason?: string | null;
}): Promise<ApprovalDecisionResult> {
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id, status, merchant_id, buyer_session_id, final_amount, currency")
    .eq("id", args.orderId)
    .eq("merchant_id", args.merchantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) {
    return { ok: false, error: { code: "order_not_found", message: "Order not found." } };
  }
  const from = order.status as CheckoutState;
  if (from !== "APPROVAL_REQUIRED") {
    return {
      ok: false,
      error: {
        code: "invalid_state_transition",
        message: `This order is ${from} and is no longer awaiting approval.`,
      },
    };
  }

  const now = new Date().toISOString();

  if (args.decision === "reject") {
    await transition({ orderId: order.id, from, to: "REJECTED", patch: { rejected_at: now } });
    await supabaseAdmin
      .from("checkout_approvals")
      .update({
        status: "rejected",
        reviewed_by: args.reviewerId,
        reviewed_at: now,
        rejection_reason: (args.rejectionReason ?? "").slice(0, 500) || "Rejected by merchant.",
      })
      .eq("order_id", order.id);
    await writeAudit({
      orderId: order.id,
      merchantId: args.merchantId,
      buyerSessionId: order.buyer_session_id,
      event: "REJECTED",
      actorType: "merchant",
      actorId: args.reviewerId,
      fromStatus: from,
      toStatus: "REJECTED",
      reason: (args.rejectionReason ?? "Rejected by merchant.").slice(0, 300),
      policyDecision: { human_in_the_loop: true, final_amount: Number(order.final_amount) },
    });
  } else {
    const state = await transition({
      orderId: order.id,
      from,
      to: "APPROVED",
      patch: { approved_by: args.reviewerId, approved_at: now },
    });
    await supabaseAdmin
      .from("checkout_approvals")
      .update({ status: "approved", reviewed_by: args.reviewerId, reviewed_at: now })
      .eq("order_id", order.id);
    await writeAudit({
      orderId: order.id,
      merchantId: args.merchantId,
      buyerSessionId: order.buyer_session_id,
      event: "APPROVED",
      actorType: "merchant",
      actorId: args.reviewerId,
      fromStatus: from,
      toStatus: "APPROVED",
      reason: "Approved by merchant.",
      policyDecision: { human_in_the_loop: true, final_amount: Number(order.final_amount) },
    });
    await finalizeApprovedOrder({
      orderId: order.id,
      merchantId: args.merchantId,
      buyerSessionId: order.buyer_session_id,
      from: state,
    });
  }

  const updated = await snapshot(order.id);
  if (!updated) throw new Error("Order could not be reloaded after review.");
  return { ok: true, order: updated };
}

export async function getOrderSnapshot(orderId: string) {
  return snapshot(orderId);
}

/** Factual, server-derived negotiation summary attached to the approval card. */
async function summarizeNegotiation(
  buyerSessionId: string,
  productId: string,
): Promise<string | null> {
  const { data: negotiation } = await supabaseAdmin
    .from("negotiation_sessions")
    .select("id, round_count, negotiation_rounds(round_number, requested_discount_percent, proposed_discount_percent, policy_decision)")
    .eq("buyer_session_id", buyerSessionId)
    .eq("product_id", productId)
    .maybeSingle();
  if (!negotiation) return null;
  const rounds = ((negotiation as unknown as Record<string, any>)["negotiation_rounds"] ?? []) as Array<
    Record<string, any>
  >;
  if (rounds.length === 0) return `Negotiation opened, ${negotiation.round_count} round(s), no discount rounds recorded.`;
  const last = rounds.sort((a, b) => Number(a["round_number"]) - Number(b["round_number"])).at(-1)!;
  return `${rounds.length} negotiation round(s); last request ${Number(last["requested_discount_percent"])}% -> server ${String(last["policy_decision"])} at ${Number(last["proposed_discount_percent"])}%.`;
}
