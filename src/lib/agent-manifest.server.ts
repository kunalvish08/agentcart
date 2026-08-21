import {
  errorResponse,
  getPolicy,
  jsonResponse,
  rateLimit,
  resolveMerchant,
  withLogging,
} from "@/lib/public-api.server";

/**
 * Shared handler for the agent discovery manifest.
 * Exposed at /.well-known/agent-manifest and /api/public/agent-manifest.
 */
export async function handleAgentManifest(endpoint: string, request: Request): Promise<Response> {
  return withLogging(endpoint, request, async () => {
    if (!rateLimit(request, "manifest", 120)) {
      return { response: errorResponse(429, "rate_limited", "Too many requests. Try again shortly.") };
    }

    const url = new URL(request.url);
    const merchant = await resolveMerchant(url.searchParams.get("merchant"));
    if (!merchant) {
      return { response: errorResponse(404, "merchant_not_found", "No public merchant found.") };
    }

    const policy = await getPolicy(merchant.id);
    const origin = url.origin;

    const body = {
      schema_version: "1.0",
      api_version: "2026-08-08",
      protocol: "agentic-commerce/discovery",
      name: merchant.name,
      description: merchant.description,
      merchant: merchant.slug,
      currency: merchant.currency,
      capabilities: {
        catalog: true,
        product_details: true,
        product_search: true,
        quotes: true,
        negotiation: policy.allow_negotiation,
        upsell: policy.allow_upsell,
        checkout: true,
        order_observation: true,
        payments: true,
        buyer_agent_payment_capture: false,
        buyer_agent_approval: false,
      },
      endpoints: {
        manifest: "/.well-known/agent-manifest",
        catalog: "/api/public/catalog",
        products: "/api/public/products/:id",
        search: "/api/public/search",
        quote: "/api/public/quote",
        negotiate: "/api/public/negotiate",
        checkout: "/api/public/checkout",
        order: "/api/public/orders/:id",
      },
      absolute_endpoints: {
        manifest: `${origin}/.well-known/agent-manifest`,
        catalog: `${origin}/api/public/catalog`,
        products: `${origin}/api/public/products/:id`,
        search: `${origin}/api/public/search`,
        quote: `${origin}/api/public/quote`,
        negotiate: `${origin}/api/public/negotiate`,
        checkout: `${origin}/api/public/checkout`,
        order: `${origin}/api/public/orders/:id`,
      },
      supported_actions: [
        { action: "browse_catalog", method: "GET", path: "/api/public/catalog", auth: "none" },
        { action: "get_product", method: "GET", path: "/api/public/products/:id", auth: "none" },
        { action: "search_products", method: "GET", path: "/api/public/search", auth: "none" },
        { action: "request_quote", method: "POST", path: "/api/public/quote", auth: "none" },
        {
          action: "request_negotiation",
          method: "POST",
          path: "/api/public/negotiate",
          auth: "agent_session",
        },
        {
          action: "request_checkout",
          method: "POST",
          path: "/api/public/checkout",
          auth: "agent_session",
        },
        {
          action: "observe_order",
          method: "GET",
          path: "/api/public/orders/:id",
          auth: "agent_session",
        },
      ],
      authentication: {
        required: false,
        type: "none",
        notes: "Discovery, search, product and quote endpoints are read-only and anonymous.",
        agent_session: {
          header: "X-Agent-Session",
          required_for: ["/api/public/negotiate", "/api/public/checkout", "/api/public/orders/:id"],
          notes:
            "Opaque, short-lived, server-issued buyer-session token. It identifies the buyer session only; it grants no authority over price, approval or payment.",
        },
      },
      commerce_policy: {
        negotiation_enabled: policy.allow_negotiation,
        upsell_enabled: policy.allow_upsell,
        max_discount_percent: policy.allow_negotiation ? policy.max_discount_percent : 0,
        max_order_value: policy.max_order_value,
        approval_required_above: policy.approval_required_above,
        max_negotiation_rounds: 4,
        quote_ttl_minutes: 15,
        currency: merchant.currency,
        pricing_authority: "server",
        notes:
          "All monetary amounts and discounts are computed and authorised server-side against merchant policy. Client-supplied prices or totals are ignored.",
      },
      buyer_agent_boundary: {
        may: [
          "discover",
          "search",
          "inspect_product",
          "request_quote",
          "request_negotiation",
          "accept_or_reject_offer",
          "request_checkout",
          "observe_order_status",
        ],
        may_not: [
          "set_final_price",
          "override_merchant_policy",
          "approve_checkout",
          "capture_payment",
          "modify_inventory",
          "modify_order_amount",
          "access_payment_credentials",
          "write_to_database",
        ],
      },
      documentation: `${origin}/agent-api`,
    };


    return { response: jsonResponse(body), merchantId: merchant.id };
  });
}
