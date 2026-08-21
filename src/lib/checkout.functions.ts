// Phase 05 — authenticated server functions for checkout and merchant approval.
//
// Nothing here trusts the client with money, merchant identity, order status or
// the approval decision: the only client inputs are opaque identifiers, and each
// one is re-checked against the caller's session and merchant ownership.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CheckoutState } from "@/lib/checkout-state";
import type { PaymentState } from "@/lib/payment-state";

const requestCheckoutSchema = z.object({
  quote_id: z.string().uuid(),
  session_id: z.string().uuid(),
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  customer_request_summary: z.string().trim().max(500).optional(),
});

export type BuyerCheckoutResult =
  | {
      ok: true;
      idempotent_replay: boolean;
      order: import("@/lib/checkout.server").OrderSnapshot;
      trace: Array<{ label: string; ok: boolean }>;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: Record<string, string | number | boolean>;
      };
      trace: Array<{ label: string; ok: boolean }>;
    };

/** Buyer-initiated checkout for a server-persisted quote. */
export const requestBuyerCheckout = createServerFn({ method: "POST" })
  .inputValidator((data: z.input<typeof requestCheckoutSchema>) => requestCheckoutSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<BuyerCheckoutResult> => {
    const { requestCheckout } = await import("@/lib/checkout.server");
    return requestCheckout({
      quoteId: data.quote_id,
      idempotencyKey: data.idempotency_key,
      buyerSessionId: data.session_id,
      userId: context.userId,
      actorType: "buyer",
      customerRequestSummary: data.customer_request_summary ?? null,
    });
  });

/** Buyer/merchant polling for one order the caller is allowed to see (RLS-scoped). */
export const getOrderStatus = createServerFn({ method: "GET" })
  .inputValidator((data: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select(
        "id, status, currency, subtotal_amount, discount_amount, final_amount, approval_required, approval_reason, created_at, approved_at, expires_at, order_items(product_id, quantity, unit_price, final_unit_price, products(name)), payments(status, razorpay_order_id, razorpay_payment_id, verified_at)",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return null;
    const item = (order.order_items ?? [])[0] as Record<string, any> | undefined;
    return {
      order_id: order.id,
      status: order.status as CheckoutState,
      currency: order.currency,
      subtotal_amount: Number(order.subtotal_amount),
      discount_amount: Number(order.discount_amount),
      final_amount: Number(order.final_amount),
      approval_required: order.approval_required,
      approval_reason: order.approval_reason,
      approved_at: order.approved_at,
      created_at: order.created_at,
      quantity: Number(item?.["quantity"] ?? 0),
      unit_price: Number(item?.["unit_price"] ?? 0),
      product_name: (item?.["products"] as { name?: string } | null)?.name ?? null,
      payment: ((order.payments ?? [])[0] as Record<string, any> | undefined) ?? null,
      payment_state: (((order.payments ?? [])[0] as { status?: string } | undefined)?.status ??
        "not_started") as PaymentState | "not_started",
    };
  });

export type BuyerActiveOrder = {
  order_id: string;
  status: CheckoutState;
  currency: string;
  final_amount: number;
  approval_required: boolean;
  approval_reason: string | null;
  created_at: string;
  product_name: string | null;
  quantity: number;
  buyer_session_id: string;
  payment_state: PaymentState | "not_started";
};

/**
 * Orders belonging to the signed-in buyer's own agent sessions, so the buyer UI can
 * resume a checkout after navigating away (the chat turn state is in-memory only).
 */
export const getMyActiveOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BuyerActiveOrder[]> => {
    const { data: sessions, error: sessionsError } = await context.supabase
      .from("agent_sessions")
      .select("id")
      .eq("user_id", context.userId)
      .order("started_at", { ascending: false })
      .limit(50);
    if (sessionsError) throw new Error(sessionsError.message);
    const sessionIds = (sessions ?? []).map((s) => s.id);
    if (sessionIds.length === 0) return [];

    const { data, error } = await context.supabase
      .from("orders")
      .select(
        "id, status, currency, final_amount, approval_required, approval_reason, created_at, buyer_session_id, order_items(quantity, products(name)), payments(status)",
      )
      .in("buyer_session_id", sessionIds)
      .in("status", [
        "CHECKOUT_REQUESTED",
        "APPROVAL_REQUIRED",
        "APPROVED",
        "ORDER_CREATED",
        "PAYMENT_PENDING",
        "PAYMENT_CAPTURED",
        "COMPLETED",
      ])
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const item = ((row as unknown as Record<string, any>)["order_items"] ?? [])[0] ?? null;
      const payment = ((row as unknown as Record<string, any>)["payments"] ?? [])[0] ?? null;
      return {
        order_id: row.id,
        status: row.status as CheckoutState,
        currency: row.currency,
        final_amount: Number(row.final_amount),
        approval_required: row.approval_required,
        approval_reason: row.approval_reason,
        created_at: row.created_at,
        product_name: item?.products?.name ?? null,
        quantity: Number(item?.quantity ?? 0),
        buyer_session_id: row.buyer_session_id,
        payment_state: (payment?.status ?? "not_started") as PaymentState | "not_started",
      };
    });
  });

/* ------------------------------ merchant side ------------------------------ */


async function ownedMerchantId(supabase: {
  from: (t: string) => any;
}, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("merchants")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

export type ApprovalQueueRow = {
  approval_id: string;
  order_id: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  rejection_reason: string | null;
  requested_at: string;
  reviewed_at: string | null;
  order_status: CheckoutState;
  currency: string;
  subtotal_amount: number;
  discount_amount: number;
  final_amount: number;
  product_name: string | null;
  quantity: number;
  customer_request_summary: string | null;
  negotiation_summary: string | null;
};

/** Merchant approval queue — RLS restricts rows to merchants the caller owns. */
export const getApprovalQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApprovalQueueRow[]> => {
    const { data, error } = await context.supabase
      .from("checkout_approvals")
      .select(
        "id, order_id, status, reason, rejection_reason, requested_at, reviewed_at, orders(status, currency, subtotal_amount, discount_amount, final_amount, customer_request_summary, negotiation_summary, order_items(quantity, products(name)))",
      )
      .order("requested_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const order = (row as unknown as Record<string, any>)["orders"] ?? {};
      const item = (order["order_items"] ?? [])[0] ?? null;
      return {
        approval_id: row.id,
        order_id: row.order_id,
        status: row.status as ApprovalQueueRow["status"],
        reason: row.reason,
        rejection_reason: row.rejection_reason,
        requested_at: row.requested_at,
        reviewed_at: row.reviewed_at,
        order_status: order["status"] as CheckoutState,
        currency: order["currency"] ?? "INR",
        subtotal_amount: Number(order["subtotal_amount"] ?? 0),
        discount_amount: Number(order["discount_amount"] ?? 0),
        final_amount: Number(order["final_amount"] ?? 0),
        product_name: item?.products?.name ?? null,
        quantity: Number(item?.quantity ?? 0),
        customer_request_summary: order["customer_request_summary"] ?? null,
        negotiation_summary: order["negotiation_summary"] ?? null,
      };
    });
  });

const reviewSchema = z.object({
  order_id: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  rejection_reason: z.string().trim().max(500).optional(),
});

/**
 * Human-in-the-loop decision. The merchant identity comes from the session, so
 * a buyer or the AI can never reach this path, and the client cannot name a
 * merchant or an amount.
 */
export const reviewCheckoutApproval = createServerFn({ method: "POST" })
  .inputValidator((data: z.input<typeof reviewSchema>) => reviewSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const merchantId = await ownedMerchantId(context.supabase, context.userId);
    if (!merchantId) throw new Error("No merchant found for this account");

    const { reviewApproval } = await import("@/lib/checkout.server");
    const result = await reviewApproval({
      orderId: data.order_id,
      merchantId,
      reviewerId: context.userId,
      decision: data.decision,
      rejectionReason: data.rejection_reason ?? null,
    });
    if (!result.ok) throw new Error(result.error.message);
    return { ok: true as const, status: result.order.status };
  });

export type CheckoutMetrics = {
  pendingApprovals: number;
  approvedToday: number;
  rejectedToday: number;
  awaitingPayment: number;
  orders: number;
  paymentPendingValue: number;
};

export const getCheckoutMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CheckoutMetrics> => {
    const { supabase } = context;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [ordersResult, approvalsResult] = await Promise.all([
      supabase.from("orders").select("status, final_amount, created_at").limit(1000),
      supabase.from("checkout_approvals").select("status, reviewed_at, requested_at").limit(1000),
    ]);
    if (ordersResult.error) throw new Error(ordersResult.error.message);
    if (approvalsResult.error) throw new Error(approvalsResult.error.message);

    const orders = ordersResult.data ?? [];
    const approvals = approvalsResult.data ?? [];
    const today = (value: string | null) =>
      Boolean(value) && new Date(value!).getTime() >= startOfDay.getTime();

    return {
      pendingApprovals: approvals.filter((a) => a.status === "pending").length,
      approvedToday: approvals.filter((a) => a.status === "approved" && today(a.reviewed_at)).length,
      rejectedToday: approvals.filter((a) => a.status === "rejected" && today(a.reviewed_at)).length,
      awaitingPayment: orders.filter((o) => o.status === "PAYMENT_PENDING").length,
      orders: orders.length,
      paymentPendingValue: orders
        .filter((o) => o.status === "PAYMENT_PENDING")
        .reduce((sum, o) => sum + Number(o.final_amount ?? 0), 0),
    };
  });

export type CheckoutAuditRow = {
  id: string;
  event: string;
  actor_type: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  created_at: string;
  order_id: string | null;
};

/** Checkout audit trail for the caller's merchant (RLS-scoped, no secrets stored). */
export const getCheckoutAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CheckoutAuditRow[]> => {
    const { data, error } = await context.supabase
      .from("checkout_audit_events")
      .select("id, event, actor_type, from_status, to_status, reason, created_at, order_id")
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return (data ?? []) as CheckoutAuditRow[];
  });
