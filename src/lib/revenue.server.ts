// Phase 1 — Merchant Revenue Agent event layer.
//
// The AI never writes these rows: every event is recorded by trusted server code
// after a deterministic policy-checked decision. No pricing authority lives here.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RevenueEventName =
  | "REVENUE_OPPORTUNITY_DETECTED"
  | "RECOMMENDATION_SHOWN"
  | "RECOMMENDATION_ACCEPTED"
  | "RECOMMENDATION_REJECTED"
  | "UPSELL_ACCEPTED"
  | "CROSS_SELL_ACCEPTED";

export async function recordRevenueEvent(entry: {
  merchantId: string;
  event: RevenueEventName;
  buyerSessionId?: string | null;
  recommendationId?: string | null;
  sourceProductId?: string | null;
  productId?: string | null;
  recommendationType?: "upsell" | "cross_sell" | null;
  amount?: number;
  currency?: string;
  reason?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from("revenue_events").insert({
      merchant_id: entry.merchantId,
      event: entry.event,
      buyer_session_id: entry.buyerSessionId ?? null,
      recommendation_id: entry.recommendationId ?? null,
      source_product_id: entry.sourceProductId ?? null,
      product_id: entry.productId ?? null,
      recommendation_type: entry.recommendationType ?? null,
      amount: entry.amount ?? 0,
      currency: entry.currency ?? "INR",
      reason: entry.reason ?? null,
      detail: entry.detail ?? {},
    });
  } catch (error) {
    // Observability must never break a commerce flow.
    console.error("[revenue] failed to record event", entry.event, error);
  }
}
