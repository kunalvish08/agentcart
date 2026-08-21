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
        checkout: false,
        payments: false,
      },
      endpoints: {
        manifest: "/.well-known/agent-manifest",
        catalog: "/api/public/catalog",
        products: "/api/public/products/:id",
        search: "/api/public/search",
        quote: "/api/public/quote",
      },
      absolute_endpoints: {
        manifest: `${origin}/.well-known/agent-manifest`,
        catalog: `${origin}/api/public/catalog`,
        products: `${origin}/api/public/products/:id`,
        search: `${origin}/api/public/search`,
        quote: `${origin}/api/public/quote`,
      },
      supported_actions: [
        { action: "browse_catalog", method: "GET", path: "/api/public/catalog" },
        { action: "get_product", method: "GET", path: "/api/public/products/:id" },
        { action: "search_products", method: "GET", path: "/api/public/search" },
        { action: "request_quote", method: "POST", path: "/api/public/quote" },
      ],
      authentication: { required: false, type: "none", notes: "Read-only public discovery APIs." },
      commerce_policy: {
        negotiation_enabled: policy.allow_negotiation,
        upsell_enabled: policy.allow_upsell,
        pricing_authority: "server",
        notes:
          "All monetary amounts and discounts are computed and authorised server-side against merchant policy. Client-supplied prices or totals are ignored.",
      },
      documentation: `${origin}/agent-api`,
    };

    return { response: jsonResponse(body), merchantId: merchant.id };
  });
}
