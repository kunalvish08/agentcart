// Phase 04 — deterministic, server-enforced negotiation + growth engine.
//
// SECURITY CONTRACT
// - The LLM never decides money. It may only *request* a discount percent.
//   Every allowed/approved percent here is derived from merchant_policies rows,
//   and every monetary figure comes from the frozen Phase 02 quote API.
// - Policy caps (max_discount_percent, max_order_value, approval_required_above,
//   allow_negotiation), inventory and product status cannot be overridden.
// - Negotiation is bounded: at most MAX_NEGOTIATION_ROUNDS rounds per
//   (buyer session, product).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPolicy, type PublicMerchant, type PublicPolicy } from "@/lib/public-api.server";

export const MAX_NEGOTIATION_ROUNDS = 4;

export type PolicyDecision = "accept" | "counter" | "reject";

export type DiscountDecision = {
  decision: PolicyDecision;
  requested_discount_percent: number;
  policy_limit_percent: number;
  approved_discount_percent: number;
  reason: string;
};

/**
 * Pure deterministic discount decision. No LLM input other than the requested
 * percent, which is clamped to the merchant's policy limit.
 */
export function decideDiscount(input: {
  requestedPercent: number;
  policy: Pick<PublicPolicy, "allow_negotiation" | "max_discount_percent">;
}): DiscountDecision {
  const requested = Number.isFinite(input.requestedPercent) ? input.requestedPercent : 0;
  const limit = input.policy.allow_negotiation
    ? Math.max(0, Math.min(100, Number(input.policy.max_discount_percent ?? 0)))
    : 0;

  if (requested < 0 || requested > 100) {
    return {
      decision: "reject",
      requested_discount_percent: requested,
      policy_limit_percent: limit,
      approved_discount_percent: 0,
      reason: "The requested discount is not a valid percentage between 0 and 100.",
    };
  }

  if (!input.policy.allow_negotiation) {
    return {
      decision: requested > 0 ? "reject" : "accept",
      requested_discount_percent: requested,
      policy_limit_percent: 0,
      approved_discount_percent: 0,
      reason:
        requested > 0
          ? "Negotiation is not available for this merchant; list price applies."
          : "No discount requested; list price applied.",
    };
  }

  if (requested === 0) {
    return {
      decision: "accept",
      requested_discount_percent: 0,
      policy_limit_percent: limit,
      approved_discount_percent: 0,
      reason: "No discount requested; list price applied.",
    };
  }

  if (requested <= limit) {
    return {
      decision: "accept",
      requested_discount_percent: requested,
      policy_limit_percent: limit,
      approved_discount_percent: requested,
      reason: `Requested ${requested}% is within the merchant's allowed discount range (max ${limit}%).`,
    };
  }

  return {
    decision: "counter",
    requested_discount_percent: requested,
    policy_limit_percent: limit,
    approved_discount_percent: limit,
    reason: `Requested ${requested}% is outside the merchant's allowed discount range; countering at the maximum ${limit}%.`,
  };
}

/* --------------------------------- quoting --------------------------------- */

export type ServerQuote = {
  quote_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  base_amount: number;
  requested_discount_percent: number;
  allowed_discount_percent: number;
  discount_amount: number;
  final_amount: number;
  currency: string;
  policy_applied: boolean;
  policy_reason: string;
  requires_merchant_approval: boolean;
  expires_at: string;
};

type QuoteOutcome =
  | { ok: true; quote: ServerQuote }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

/** Always goes through the Phase 02 quote endpoint: the pricing authority. */
export async function requestServerQuote(args: {
  baseUrl: string;
  merchantSlug: string;
  productId: string;
  quantity: number;
  discountPercent: number;
}): Promise<QuoteOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(new URL("/api/public/quote", args.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        product_id: args.productId,
        quantity: args.quantity,
        requested_discount_percent: args.discountPercent,
        merchant: args.merchantSlug,
      }),
    });
    const body = (await response.json().catch(() => null)) as any;
    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: String(body?.error?.code ?? `http_${response.status}`),
          message: String(body?.error?.message ?? "The quote could not be produced."),
          ...(body?.error?.details ? { details: body.error.details } : {}),
        },
      };
    }
    return { ok: true, quote: body as ServerQuote };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: {
        code: aborted ? "quote_timeout" : "quote_unavailable",
        message: "The pricing service could not be reached, so no price can be given.",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------- negotiation ------------------------------- */

export type NegotiationOutcome = {
  negotiation_available: boolean;
  negotiation_session_id: string | null;
  round_number: number;
  rounds_remaining: number;
  decision: PolicyDecision;
  requested_discount_percent: number;
  policy_limit_percent: number;
  approved_discount_percent: number;
  policy_reason: string;
  message: string;
  quote: ServerQuote | null;
  quote_error: { code: string; message: string; details?: unknown } | null;
  offer_id: string | null;
  policy_authority: "server";
};

async function loadSellableProduct(merchantId: string, productId: string) {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, name, price, currency, stock_quantity, status")
    .eq("id", productId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function upsertNegotiationSession(args: {
  buyerSessionId: string;
  merchantId: string;
  productId: string;
}) {
  const { data: existing } = await supabaseAdmin
    .from("negotiation_sessions")
    .select("id, status, round_count")
    .eq("buyer_session_id", args.buyerSessionId)
    .eq("product_id", args.productId)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("negotiation_sessions")
    .insert({
      buyer_session_id: args.buyerSessionId,
      merchant_id: args.merchantId,
      product_id: args.productId,
      status: "open",
    })
    .select("id, status, round_count")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not open a negotiation session.");
  return data;
}

/**
 * Full negotiation round: policy lookup -> deterministic decision ->
 * server-calculated quote -> persisted round + offer. Called only by the
 * controlled tool layer; never by the model directly.
 */
export async function runNegotiationRound(args: {
  merchant: PublicMerchant;
  buyerSessionId: string | null;
  baseUrl: string;
  productId: string;
  quantity: number;
  requestedDiscountPercent: number;
  customerRequestSummary?: string | undefined;
}): Promise<NegotiationOutcome> {
  const startedAt = Date.now();
  const policy = await getPolicy(args.merchant.id);

  const base: NegotiationOutcome = {
    negotiation_available: policy.allow_negotiation,
    negotiation_session_id: null,
    round_number: 0,
    rounds_remaining: MAX_NEGOTIATION_ROUNDS,
    decision: "reject",
    requested_discount_percent: args.requestedDiscountPercent,
    policy_limit_percent: policy.allow_negotiation ? policy.max_discount_percent : 0,
    approved_discount_percent: 0,
    policy_reason: "",
    message: "",
    quote: null,
    quote_error: null,
    offer_id: null,
    policy_authority: "server",
  };

  const product = await loadSellableProduct(args.merchant.id, args.productId);
  if (!product) {
    return {
      ...base,
      policy_reason: "Product not found for this merchant.",
      message: "That product is not in this merchant's catalog, so no offer can be made.",
      quote_error: { code: "product_not_found", message: "Product not found." },
    };
  }
  if (product.status !== "active") {
    return {
      ...base,
      policy_reason: "Product is inactive.",
      message: "That product is not available for sale, so no offer can be made.",
      quote_error: { code: "product_inactive", message: "Product is not available for sale." },
    };
  }
  if (product.stock_quantity < args.quantity) {
    return {
      ...base,
      policy_reason: "Insufficient inventory.",
      message: `Only ${product.stock_quantity} unit(s) are in stock, so no offer can be generated for ${args.quantity}.`,
      quote_error: {
        code: "insufficient_inventory",
        message: "Not enough inventory for this quantity.",
        details: { requested_quantity: args.quantity, available_quantity: product.stock_quantity },
      },
    };
  }

  const decision = decideDiscount({ requestedPercent: args.requestedDiscountPercent, policy });

  if (!policy.allow_negotiation && args.requestedDiscountPercent > 0) {
    return {
      ...base,
      decision: "reject",
      policy_reason: decision.reason,
      message: "Negotiation is not available for this merchant.",
    };
  }

  const session = args.buyerSessionId
    ? await upsertNegotiationSession({
        buyerSessionId: args.buyerSessionId,
        merchantId: args.merchant.id,
        productId: product.id,
      })
    : null;

  const roundNumber = (session?.round_count ?? 0) + 1;
  if (session && roundNumber > MAX_NEGOTIATION_ROUNDS) {
    await supabaseAdmin
      .from("negotiation_sessions")
      .update({ status: "closed" })
      .eq("id", session.id);
    return {
      ...base,
      negotiation_session_id: session.id,
      round_number: MAX_NEGOTIATION_ROUNDS,
      rounds_remaining: 0,
      decision: "reject",
      policy_reason: `Negotiation limit of ${MAX_NEGOTIATION_ROUNDS} rounds reached.`,
      message: `This negotiation has reached its ${MAX_NEGOTIATION_ROUNDS}-round limit. The best available discount remains ${decision.policy_limit_percent}%.`,
    };
  }

  // Money is produced only here, by the frozen quote API.
  const quoteOutcome = await requestServerQuote({
    baseUrl: args.baseUrl,
    merchantSlug: args.merchant.slug,
    productId: product.id,
    quantity: args.quantity,
    discountPercent: decision.approved_discount_percent,
  });

  const finalDecision: PolicyDecision = quoteOutcome.ok ? decision.decision : "reject";
  const quote = quoteOutcome.ok ? quoteOutcome.quote : null;
  const quoteError = quoteOutcome.ok ? null : quoteOutcome.error;

  let message: string;
  if (!quote) {
    message =
      quoteError?.code === "order_value_exceeded"
        ? "This order exceeds the merchant's maximum order value, so the quote is rejected."
        : "No valid server quote could be produced, so no price or discount is offered.";
  } else if (finalDecision === "counter") {
    message = `${decision.requested_discount_percent}% is outside the merchant's allowed discount range. I can offer up to ${decision.policy_limit_percent}%.`;
  } else if (decision.approved_discount_percent > 0) {
    message = `${decision.approved_discount_percent}% is approved under merchant policy.`;
  } else {
    message = "No discount applies; the list price stands.";
  }

  let offerId: string | null = null;
  if (session) {
    if (quote) {
      const { data: offer } = await supabaseAdmin
        .from("offers")
        .insert({
          negotiation_session_id: session.id,
          product_id: product.id,
          quantity: args.quantity,
          unit_price: quote.unit_price,
          base_amount: quote.base_amount,
          requested_discount_percent: decision.requested_discount_percent,
          approved_discount_percent: quote.allowed_discount_percent,
          discount_amount: quote.discount_amount,
          final_amount: quote.final_amount,
          currency: quote.currency,
          requires_merchant_approval: quote.requires_merchant_approval,
          status: "proposed",
          quote_id: quote.quote_id,
          expires_at: quote.expires_at,
        })
        .select("id")
        .maybeSingle();
      offerId = offer?.id ?? null;
    }

    await supabaseAdmin.from("negotiation_rounds").insert({
      session_id: session.id,
      round_number: roundNumber,
      customer_request_summary: (args.customerRequestSummary ?? "").slice(0, 500) || null,
      requested_discount_percent: decision.requested_discount_percent,
      proposed_discount_percent: decision.approved_discount_percent,
      allowed_discount_percent: decision.policy_limit_percent,
      policy_decision: finalDecision,
      policy_reason: decision.reason.slice(0, 500),
      response_summary: message.slice(0, 500),
      quote_id: quote?.quote_id ?? null,
      latency_ms: Date.now() - startedAt,
    });

    await supabaseAdmin
      .from("negotiation_sessions")
      .update({
        round_count: roundNumber,
        status: finalDecision === "reject" && !quote ? "rejected" : "open",
      })
      .eq("id", session.id);
  }

  return {
    negotiation_available: policy.allow_negotiation,
    negotiation_session_id: session?.id ?? null,
    round_number: roundNumber,
    rounds_remaining: Math.max(0, MAX_NEGOTIATION_ROUNDS - roundNumber),
    decision: finalDecision,
    requested_discount_percent: decision.requested_discount_percent,
    policy_limit_percent: decision.policy_limit_percent,
    approved_discount_percent: quote?.allowed_discount_percent ?? 0,
    policy_reason: decision.reason,
    message,
    quote,
    quote_error: quoteError,
    offer_id: offerId,
    policy_authority: "server",
  };
}

/* ------------------------------ growth engine ------------------------------ */

export type GrowthRecommendation = {
  recommendation_id: string | null;
  product_id: string;
  name: string;
  price: number;
  currency: string;
  recommendation_type: "upsell" | "cross_sell";
  relation_type: string;
  reason: string;
  in_stock: boolean;
};

/**
 * Deterministic growth picks: merchant-curated relations only, active + in
 * stock only, upsell gated by policy, at most 2 results, factual reasons.
 */
export async function eligibleGrowthRecommendations(args: {
  merchant: PublicMerchant;
  buyerSessionId: string | null;
  productId: string;
  limit?: number;
}): Promise<{
  source_product_id: string;
  source_product_name: string | null;
  count: number;
  recommendations: GrowthRecommendation[];
  note?: string;
}> {
  const policy = await getPolicy(args.merchant.id);
  const { recordRevenueEvent } = await import("@/lib/revenue.server");

  if (!policy.allow_upsell) {
    // Record that we blocked a recommendation attempt due to policy
    await recordRevenueEvent({
      merchantId: args.merchant.id,
      event: "REVENUE_OPPORTUNITY_DETECTED",
      buyerSessionId: args.buyerSessionId ?? null,
      sourceProductId: args.productId,
      reason: "Blocked by merchant policy (allow_upsell is OFF)",
      detail: { allow_upsell: false, policy_authority: "server" },
    });
    return {
      source_product_id: args.productId,
      source_product_name: (await loadSellableProduct(args.merchant.id, args.productId))?.name ?? null,
      count: 0,
      recommendations: [],
      note: "Merchant policy has disabled upselling/cross-selling recommendations.",
    };
  }

  const { fetchRelatedProducts } = await import("@/lib/public-api.server");
  const source = await loadSellableProduct(args.merchant.id, args.productId);
  const related = await fetchRelatedProducts(args.merchant.id, args.productId, true);


  const limit = Math.max(1, Math.min(2, args.limit ?? 2));
  const candidates = related
    .filter((r) => r.in_stock)
    .filter((r) => r.relation_type === "upsell" || r.relation_type === "cross_sell");
  const picks = candidates.slice(0, limit);

  if (candidates.length > 0) {
    await recordRevenueEvent({
      merchantId: args.merchant.id,
      event: "REVENUE_OPPORTUNITY_DETECTED",
      buyerSessionId: args.buyerSessionId ?? null,
      sourceProductId: args.productId,
      detail: {
        candidate_count: candidates.length,
        allow_upsell: policy.allow_upsell,
        policy_authority: "server",
      },
    });
  }

  if (picks.length === 0) {
    return {
      source_product_id: args.productId,
      source_product_name: source?.name ?? null,
      count: 0,
      recommendations: [],
      note: "No eligible related products are active and in stock. Do not suggest anything else.",
    };
  }


  const recommendations: GrowthRecommendation[] = [];
  for (const pick of picks) {
    const type = pick.relation_type === "upsell" ? "upsell" : "cross_sell";
    const reason =
      type === "upsell"
        ? `Listed by the merchant as a higher-tier option to ${source?.name ?? "the selected product"}, and currently in stock.`
        : `Listed by the merchant as an accessory for ${source?.name ?? "the selected product"}, and currently in stock.`;

    let recommendationId: string | null = null;
    if (args.buyerSessionId) {
      const { data } = await supabaseAdmin
        .from("growth_recommendations")
        .insert({
          buyer_session_id: args.buyerSessionId,
          merchant_id: args.merchant.id,
          source_product_id: args.productId,
          recommended_product_id: pick.product_id,
          recommendation_type: type,
          reason,
          recommended_price: pick.price,
          currency: pick.currency,
        })
        .select("id")
        .maybeSingle();
      recommendationId = data?.id ?? null;
    }

    await recordRevenueEvent({
      merchantId: args.merchant.id,
      event: "RECOMMENDATION_SHOWN",
      buyerSessionId: args.buyerSessionId ?? null,
      recommendationId,
      sourceProductId: args.productId,
      productId: pick.product_id,
      recommendationType: type,
      amount: pick.price,
      currency: pick.currency,
      reason,
      detail: { relation_type: pick.relation_type, pricing_authority: "server" },
    });



    recommendations.push({
      recommendation_id: recommendationId,
      product_id: pick.product_id,
      name: pick.name,
      price: pick.price,
      currency: pick.currency,
      recommendation_type: type,
      relation_type: pick.relation_type,
      reason,
      in_stock: pick.in_stock,
    });
  }

  return {
    source_product_id: args.productId,
    source_product_name: source?.name ?? null,
    count: recommendations.length,
    recommendations,
  };
}
