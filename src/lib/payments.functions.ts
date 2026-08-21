// Phase 06 — authenticated server functions for the Razorpay test-mode payment layer.
//
// The only client input anywhere in this file is an opaque identifier (order id) or
// the values Razorpay Checkout itself hands the browser (razorpay order/payment id
// and signature), all of which are re-verified server-side. No amount, currency,
// discount or status is ever accepted from the browser.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CheckoutState } from "@/lib/checkout-state";
import type { PaymentState } from "@/lib/payment-state";

const orderIdSchema = z.object({ order_id: z.string().uuid() });

const verifySchema = z.object({
  order_id: z.string().uuid(),
  razorpay_order_id: z.string().min(6).max(64).regex(/^order_[A-Za-z0-9]+$/),
  razorpay_payment_id: z.string().min(6).max(64).regex(/^pay_[A-Za-z0-9]+$/),
  razorpay_signature: z.string().regex(/^[a-fA-F0-9]{64}$/),
});

/** Creates the Razorpay test-mode order for an internal order. Amount is server-side. */
export const initializeOrderPayment = createServerFn({ method: "POST" })
  .inputValidator((data: z.input<typeof orderIdSchema>) => orderIdSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { initializePayment } = await import("@/lib/payments.server");
    return initializePayment({ orderId: data.order_id, userId: context.userId });
  });

/** Verifies a browser-reported payment: HMAC signature + provider read-back. */
export const verifyOrderPayment = createServerFn({ method: "POST" })
  .inputValidator((data: z.input<typeof verifySchema>) => verifySchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { verifyClientPayment } = await import("@/lib/payments.server");
    return verifyClientPayment({
      orderId: data.order_id,
      userId: context.userId,
      razorpayOrderId: data.razorpay_order_id,
      razorpayPaymentId: data.razorpay_payment_id,
      signature: data.razorpay_signature,
    });
  });

export type OrderPaymentView = {
  payment_id: string;
  order_id: string;
  status: PaymentState;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  amount: number;
  currency: string;
  method: string | null;
  authorized_at: string | null;
  captured_at: string | null;
  verified_at: string | null;
  failure_reason: string | null;
  created_at: string;
  mode: string;
};

/** Buyer/merchant payment view for one order. RLS decides who may read the row. */
export const getOrderPayment = createServerFn({ method: "GET" })
  .inputValidator((data: z.input<typeof orderIdSchema>) => orderIdSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<OrderPaymentView | null> => {
    const { data: row, error } = await context.supabase
      .from("payments")
      .select(
        "id, order_id, status, razorpay_order_id, razorpay_payment_id, amount, currency, method, authorized_at, captured_at, verified_at, failure_reason, created_at, mode",
      )
      .eq("order_id", data.order_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      payment_id: row.id,
      order_id: row.order_id,
      status: row.status as PaymentState,
      razorpay_order_id: row.razorpay_order_id,
      razorpay_payment_id: row.razorpay_payment_id,
      amount: Number(row.amount),
      currency: row.currency,
      method: row.method,
      authorized_at: row.authorized_at,
      captured_at: row.captured_at,
      verified_at: row.verified_at,
      failure_reason: row.failure_reason,
      created_at: row.created_at,
      mode: row.mode,
    };
  });

export type PaymentMetrics = {
  configured: boolean;
  pending: number;
  verified: number;
  failed: number;
  completedOrders: number;
  verifiedValue: number;
  pendingValue: number;
};

/** Merchant control-room counters. RLS scopes rows to merchants the caller owns. */
export const getPaymentMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentMetrics> => {
    const { isRazorpayConfigured } = await import("@/lib/razorpay.server");
    const [payments, orders] = await Promise.all([
      context.supabase.from("payments").select("status, amount").limit(1000),
      context.supabase.from("orders").select("status").limit(1000),
    ]);
    if (payments.error) throw new Error(payments.error.message);
    if (orders.error) throw new Error(orders.error.message);

    const rows = payments.data ?? [];
    const open = rows.filter((p) => ["CREATED", "PENDING", "AUTHORIZED"].includes(p.status));
    const verified = rows.filter((p) => p.status === "VERIFIED");
    return {
      configured: isRazorpayConfigured(),
      pending: open.length,
      verified: verified.length,
      failed: rows.filter((p) => p.status === "FAILED").length,
      completedOrders: (orders.data ?? []).filter((o) => o.status === "COMPLETED").length,
      verifiedValue: verified.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
      pendingValue: open.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    };
  });

export type PaymentLedgerRow = {
  payment_id: string;
  order_id: string;
  order_status: CheckoutState;
  payment_status: PaymentState;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  amount: number;
  currency: string;
  method: string | null;
  captured_at: string | null;
  verified_at: string | null;
  failure_reason: string | null;
  created_at: string;
  product_name: string | null;
};

/** Read-only payment ledger for the merchant control room. No capture/refund actions. */
export const getPaymentLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentLedgerRow[]> => {
    const { data, error } = await context.supabase
      .from("payments")
      .select(
        "id, order_id, status, razorpay_order_id, razorpay_payment_id, amount, currency, method, captured_at, verified_at, failure_reason, created_at, orders(status, order_items(products(name)))",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
      const order = (row as unknown as Record<string, any>)["orders"] ?? {};
      const item = (order["order_items"] ?? [])[0] ?? null;
      return {
        payment_id: row.id,
        order_id: row.order_id,
        order_status: (order["status"] ?? "PAYMENT_PENDING") as CheckoutState,
        payment_status: row.status as PaymentState,
        razorpay_order_id: row.razorpay_order_id,
        razorpay_payment_id: row.razorpay_payment_id,
        amount: Number(row.amount),
        currency: row.currency,
        method: row.method,
        captured_at: row.captured_at,
        verified_at: row.verified_at,
        failure_reason: row.failure_reason,
        created_at: row.created_at,
        product_name: item?.products?.name ?? null,
      };
    });
  });

/**
 * Merchant-triggered reconciliation for payments stuck as pending. Read-only at the
 * provider: it never captures, refunds or retries money movement.
 */
export const runPaymentReconciliation = createServerFn({ method: "POST" })
  .inputValidator((data: { order_id?: string | null } | undefined) =>
    z.object({ order_id: z.string().uuid().nullish() }).parse(data ?? {}),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { data: merchant, error } = await context.supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!merchant) throw new Error("No merchant found for this account");

    const { reconcilePayments } = await import("@/lib/payments.server");
    return reconcilePayments({
      merchantId: merchant.id,
      reviewerId: context.userId,
      orderId: data.order_id ?? null,
    });
  });
