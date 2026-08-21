// Phase 03 — controlled tool layer for the AI Buyer.
//
// SECURITY CONTRACT
// - The model can only ever invoke the five tools registered in TOOL_REGISTRY.
// - Tool arguments are model-generated and therefore untrusted: every call is
//   re-validated with Zod before any execution.
// - Tools have no database connection, no SQL, no credentials and no arbitrary
//   URL access. They call the frozen Phase 02 public endpoints on this origin
//   only, which remain the single source of truth for catalog data and pricing.
// - The tool layer is READ + QUOTE only. Nothing here mutates products,
//   policies, inventory or payments.
import { z } from "zod";

import { DEFAULT_MERCHANT_SLUG, resolveMerchant, type PublicMerchant } from "@/lib/public-api.server";

export const TOOL_TIMEOUT_MS = 12_000;

/* --------------------------------- schemas -------------------------------- */

const searchCatalogSchema = z.object({
  query: z.string().trim().min(1).max(200),
  max_price: z.number().positive().max(1_000_000_000).optional(),
  category: z.string().trim().max(80).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

const productIdSchema = z.object({
  product_id: z.string().uuid("product_id must be a catalog product UUID"),
});

const quoteToolSchema = z.object({
  product_id: z.string().uuid("product_id must be a catalog product UUID"),
  quantity: z.number().int().min(1).max(100),
  requested_discount_percent: z.number().min(0).max(100).optional(),
});

const currentQuoteSchema = z.object({
  product_id: z.string().uuid("product_id must be a catalog product UUID"),
  quantity: z.number().int().min(1).max(100),
});

const proposeDiscountSchema = z.object({
  product_id: z.string().uuid("product_id must be a catalog product UUID"),
  quantity: z.number().int().min(1).max(100),
  requested_discount_percent: z.number().min(0).max(100),
  customer_request_summary: z.string().trim().max(300).optional(),
});

const validateOfferSchema = z.object({
  product_id: z.string().uuid("product_id must be a catalog product UUID"),
  quantity: z.number().int().min(1).max(100),
  discount_percent: z.number().min(0).max(100),
});

const requestCheckoutSchema = z.object({
  quote_id: z.string().uuid("quote_id must be the quote_id returned by a quote tool"),
  idempotency_key: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,128}$/, "idempotency_key must be 8-128 chars of A-Z, a-z, 0-9, '-' or '_'")
    .optional(),
});

const relatedGrowthSchema = z.object({
  product_id: z.string().uuid("product_id must be a catalog product UUID"),
  limit: z.number().int().min(1).max(2).optional(),
});

const emptySchema = z.object({}).strip();

/* ------------------------------ tool registry ----------------------------- */

export type ToolName =
  | "search_catalog"
  | "get_product"
  | "get_related_products"
  | "get_quote"
  | "get_merchant_info"
  | "get_merchant_policy"
  | "get_current_quote"
  | "get_eligible_related_products"
  | "propose_discount"
  | "validate_offer"
  | "request_checkout";

export type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
  /** Optional deterministic trace label override (observable actions only). */
  label?: string;
};

export type ToolContext = {
  baseUrl: string;
  merchant?: PublicMerchant | null;
  buyerSessionId?: string | null;
  /** Authenticated user that owns the buyer session; never model-supplied. */
  userId?: string | null;
};

type ToolDefinition = {
  name: ToolName;
  description: string;
  parameters: Record<string, unknown>;
  schema: z.ZodTypeAny;
  label: (args: Record<string, unknown>) => string;
  run: (args: any, ctx: ToolContext) => Promise<ToolResult>;
};

function jsonSchema(properties: Record<string, unknown>, required: string[]) {
  return { type: "object", properties, required, additionalProperties: false };
}

async function contextMerchant(ctx: ToolContext): Promise<PublicMerchant | null> {
  return ctx.merchant ?? (await resolveMerchant(DEFAULT_MERCHANT_SLUG));
}


async function callPublicApi(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<ToolResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const response = await fetch(new URL(path, baseUrl), {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text || "{}");
    } catch {
      body = null;
    }
    if (!response.ok) {
      const err =
        body && typeof body === "object" && "error" in (body as Record<string, unknown>)
          ? ((body as Record<string, unknown>)["error"] as Record<string, unknown>)
          : null;
      return {
        ok: false,
        error: {
          code: String(err?.["code"] ?? `http_${response.status}`),
          message: String(err?.["message"] ?? "The commerce API rejected the request."),
          ...(err?.["details"] ? { details: err["details"] } : {}),
        },
      };
    }
    return { ok: true, data: body };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: {
        code: aborted ? "tool_timeout" : "tool_unavailable",
        message: aborted
          ? "The commerce API did not respond in time."
          : "The commerce API could not be reached.",
      },
    };
  }
}

export const TOOL_REGISTRY: Record<ToolName, ToolDefinition> = {
  search_catalog: {
    name: "search_catalog",
    description:
      "Search the merchant's live product catalog. Deterministic server-side search; only active, publicly listed products are returned.",
    parameters: jsonSchema(
      {
        query: { type: "string", description: "Keywords, e.g. 'coding laptop'." },
        max_price: { type: "number", description: "Maximum unit price in the merchant currency." },
        category: { type: "string", description: "Optional exact category filter." },
        limit: { type: "integer", description: "Max results, 1-10." },
      },
      ["query"],
    ),
    schema: searchCatalogSchema,
    label: (a) => `Searching catalog for "${String(a["query"] ?? "")}"`,
    run: async (args: z.infer<typeof searchCatalogSchema>, { baseUrl }) => {
      const params = new URLSearchParams({ q: args.query, merchant: DEFAULT_MERCHANT_SLUG });
      if (args.max_price !== undefined) params.set("max_price", String(args.max_price));
      if (args.category) params.set("category", args.category);
      params.set("limit", String(args.limit ?? 5));
      const result = await callPublicApi(baseUrl, `/api/public/search?${params.toString()}`);
      if (!result.ok) return result;
      const body = result.data as { count?: number; results?: unknown[] };
      if (!body?.count) {
        return {
          ok: true,
          data: {
            count: 0,
            results: [],
            note: "No products in the live catalog match these criteria. Do not invent products.",
          },
        };
      }
      return result;
    },
  },

  get_product: {
    name: "get_product",
    description:
      "Get full public details for one catalog product by its product_id, including availability and related products.",
    parameters: jsonSchema(
      { product_id: { type: "string", description: "product_id returned by search_catalog." } },
      ["product_id"],
    ),
    schema: productIdSchema,
    label: () => "Inspecting product details",
    run: async (args: z.infer<typeof productIdSchema>, { baseUrl }) =>
      callPublicApi(
        baseUrl,
        `/api/public/products/${args.product_id}?merchant=${DEFAULT_MERCHANT_SLUG}`,
      ),
  },

  get_related_products: {
    name: "get_related_products",
    description:
      "Get policy-eligible related products (cross-sell, and upsell only when merchant policy allows) for a product_id.",
    parameters: jsonSchema(
      { product_id: { type: "string", description: "product_id to find accessories for." } },
      ["product_id"],
    ),
    schema: productIdSchema,
    label: () => "Checking related products",
    run: async (args: z.infer<typeof productIdSchema>, { baseUrl }) => {
      const result = await callPublicApi(
        baseUrl,
        `/api/public/products/${args.product_id}?merchant=${DEFAULT_MERCHANT_SLUG}`,
      );
      if (!result.ok) return result;
      const body = result.data as { related_products?: unknown[] };
      return {
        ok: true,
        data: {
          product_id: args.product_id,
          count: body?.related_products?.length ?? 0,
          related_products: body?.related_products ?? [],
        },
      };
    },
  },

  get_quote: {
    name: "get_quote",
    description:
      "Request the authoritative server-calculated quote. You must never compute or estimate prices, discounts or totals yourself — always call this tool and report exactly what it returns.",
    parameters: jsonSchema(
      {
        product_id: { type: "string" },
        quantity: { type: "integer", description: "Units to quote, 1-100." },
        requested_discount_percent: {
          type: "number",
          description: "Optional discount request; the server caps it by merchant policy.",
        },
      },
      ["product_id", "quantity"],
    ),
    schema: quoteToolSchema,
    label: () => "Requesting server-calculated quote",
    run: async (args: z.infer<typeof quoteToolSchema>, { baseUrl }) =>
      callPublicApi(baseUrl, "/api/public/quote", {
        method: "POST",
        body: JSON.stringify({
          product_id: args.product_id,
          quantity: args.quantity,
          requested_discount_percent: args.requested_discount_percent ?? 0,
          merchant: DEFAULT_MERCHANT_SLUG,
        }),
      }),
  },

  get_merchant_info: {
    name: "get_merchant_info",
    description:
      "Get public merchant information and supported commerce capabilities. Takes no arguments.",
    parameters: jsonSchema({}, []),
    schema: emptySchema,
    label: () => "Reading merchant capabilities",
    run: async (_args: unknown, { baseUrl }) =>
      callPublicApi(baseUrl, `/api/public/agent-manifest?merchant=${DEFAULT_MERCHANT_SLUG}`),
  },

  /* --------------------------- Phase 04 negotiation -------------------------- */

  get_merchant_policy: {
    name: "get_merchant_policy",
    description:
      "Read the merchant's live commercial policy: whether negotiation is allowed, the maximum discount percent, the maximum order value and the approval threshold. Never assume these numbers — always read them. Takes no arguments.",
    parameters: jsonSchema({}, []),
    schema: emptySchema,
    label: () => "Merchant policy checked",
    run: async (_args: unknown, ctx) => {
      const merchant = await contextMerchant(ctx);
      if (!merchant) {
        return {
          ok: false,
          error: { code: "merchant_unavailable", message: "No public merchant is available." },
        };
      }
      const { getPolicy } = await import("@/lib/public-api.server");
      const { MAX_NEGOTIATION_ROUNDS } = await import("@/lib/negotiation.server");
      const policy = await getPolicy(merchant.id);
      return {
        ok: true,
        label: `Merchant policy checked — max discount ${policy.max_discount_percent}%`,
        data: {
          merchant: merchant.slug,
          currency: merchant.currency,
          allow_negotiation: policy.allow_negotiation,
          max_discount_percent: policy.max_discount_percent,
          max_order_value: policy.max_order_value,
          approval_required_above: policy.approval_required_above,
          allow_upsell: policy.allow_upsell,
          max_negotiation_rounds: MAX_NEGOTIATION_ROUNDS,
          policy_authority: "server",
        },
      };
    },
  },

  get_current_quote: {
    name: "get_current_quote",
    description:
      "Get the current server-calculated list-price quote (no discount) for a product and quantity. Use before negotiating so you know the starting order value.",
    parameters: jsonSchema(
      { product_id: { type: "string" }, quantity: { type: "integer", description: "Units, 1-100." } },
      ["product_id", "quantity"],
    ),
    schema: currentQuoteSchema,
    label: () => "Requesting current server quote",
    run: async (args: z.infer<typeof currentQuoteSchema>, ctx) => {
      const merchant = await contextMerchant(ctx);
      if (!merchant) {
        return {
          ok: false,
          error: { code: "merchant_unavailable", message: "No public merchant is available." },
        };
      }
      const { requestServerQuote } = await import("@/lib/negotiation.server");
      const outcome = await requestServerQuote({
        baseUrl: ctx.baseUrl,
        merchantSlug: merchant.slug,
        productId: args.product_id,
        quantity: args.quantity,
        discountPercent: 0,
      });
      if (!outcome.ok) return { ok: false, error: outcome.error };
      return { ok: true, data: outcome.quote };
    },
  },

  propose_discount: {
    name: "propose_discount",
    description:
      "Ask the merchant-side negotiation engine for a decision on a customer discount request. The server decides accept / counter / reject from live merchant policy, inventory and order value, and returns the authoritative recalculated quote. You must report exactly what it returns and never invent a different discount or price.",
    parameters: jsonSchema(
      {
        product_id: { type: "string" },
        quantity: { type: "integer", description: "Units, 1-100." },
        requested_discount_percent: {
          type: "number",
          description: "The discount percent the customer actually asked for, 0-100.",
        },
        customer_request_summary: {
          type: "string",
          description: "Short factual summary of the customer's request.",
        },
      },
      ["product_id", "quantity", "requested_discount_percent"],
    ),
    schema: proposeDiscountSchema,
    label: () => "Negotiating with merchant policy engine",
    run: async (args: z.infer<typeof proposeDiscountSchema>, ctx) => {
      const merchant = await contextMerchant(ctx);
      if (!merchant) {
        return {
          ok: false,
          error: { code: "merchant_unavailable", message: "No public merchant is available." },
        };
      }
      const { runNegotiationRound } = await import("@/lib/negotiation.server");
      const outcome = await runNegotiationRound({
        merchant,
        buyerSessionId: ctx.buyerSessionId ?? null,
        baseUrl: ctx.baseUrl,
        productId: args.product_id,
        quantity: args.quantity,
        requestedDiscountPercent: args.requested_discount_percent,
        customerRequestSummary: args.customer_request_summary,
      });
      const label = !outcome.negotiation_available
        ? "Negotiation unavailable by merchant policy"
        : outcome.decision === "counter"
          ? `Counter-offer generated at ${outcome.approved_discount_percent}%`
          : outcome.decision === "accept"
            ? `Discount ${outcome.approved_discount_percent}% approved by policy`
            : `Negotiation rejected (${outcome.quote_error?.code ?? "policy"})`;
      return { ok: true, label, data: outcome };
    },
  },

  validate_offer: {
    name: "validate_offer",
    description:
      "Final deterministic server validation of an offer before you present it. Confirms the discount is within policy, inventory covers the quantity and the order value is allowed, and returns the server-calculated amounts.",
    parameters: jsonSchema(
      {
        product_id: { type: "string" },
        quantity: { type: "integer" },
        discount_percent: { type: "number", description: "Discount percent you intend to present." },
      },
      ["product_id", "quantity", "discount_percent"],
    ),
    schema: validateOfferSchema,
    label: () => "Validating offer against merchant policy",
    run: async (args: z.infer<typeof validateOfferSchema>, ctx) => {
      const merchant = await contextMerchant(ctx);
      if (!merchant) {
        return {
          ok: false,
          error: { code: "merchant_unavailable", message: "No public merchant is available." },
        };
      }
      const { getPolicy } = await import("@/lib/public-api.server");
      const { decideDiscount, requestServerQuote } = await import("@/lib/negotiation.server");
      const policy = await getPolicy(merchant.id);
      const decision = decideDiscount({
        requestedPercent: args.discount_percent,
        policy,
      });
      const outcome = await requestServerQuote({
        baseUrl: ctx.baseUrl,
        merchantSlug: merchant.slug,
        productId: args.product_id,
        quantity: args.quantity,
        discountPercent: decision.approved_discount_percent,
      });
      if (!outcome.ok) {
        return {
          ok: true,
          label: `Offer rejected by server validation (${outcome.error.code})`,
          data: {
            valid: false,
            reason: outcome.error.message,
            error_code: outcome.error.code,
            policy_limit_percent: decision.policy_limit_percent,
            policy_authority: "server",
          },
        };
      }
      const valid = decision.approved_discount_percent === args.discount_percent;
      return {
        ok: true,
        label: valid
          ? `Offer validated at ${decision.approved_discount_percent}%`
          : `Offer corrected to policy maximum ${decision.policy_limit_percent}%`,
        data: {
          valid,
          policy_limit_percent: decision.policy_limit_percent,
          approved_discount_percent: outcome.quote.allowed_discount_percent,
          policy_reason: decision.reason,
          quote: outcome.quote,
          policy_authority: "server",
        },
      };
    },
  },

  get_eligible_related_products: {
    name: "get_eligible_related_products",
    description:
      "Get at most 2 policy-eligible growth recommendations (upsell / cross-sell) for a selected product. Only merchant-curated, active, in-stock products are returned, each with a factual reason. If the list is empty, recommend nothing.",
    parameters: jsonSchema(
      {
        product_id: { type: "string", description: "The selected product_id." },
        limit: { type: "integer", description: "1 or 2." },
      },
      ["product_id"],
    ),
    schema: relatedGrowthSchema,
    label: () => "Checking eligible growth recommendations",
    run: async (args: z.infer<typeof relatedGrowthSchema>, ctx) => {
      const merchant = await contextMerchant(ctx);
      if (!merchant) {
        return {
          ok: false,
          error: { code: "merchant_unavailable", message: "No public merchant is available." },
        };
      }
      const { eligibleGrowthRecommendations } = await import("@/lib/negotiation.server");
      const data = await eligibleGrowthRecommendations({
        merchant,
        buyerSessionId: ctx.buyerSessionId ?? null,
        productId: args.product_id,
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
      });
      return {
        ok: true,
        label: `Eligible recommendations: ${data.count}`,
        data,
      };
    },
  },

  /* ---------------------------- Phase 05 checkout --------------------------- */

  request_checkout: {
    name: "request_checkout",
    description:
      "Request checkout for a quote the server already produced. You must pass the quote_id exactly as returned by a quote tool. You never pass or compute any amount: the server reloads the authoritative quote, re-validates inventory and merchant policy, decides whether merchant approval is required and creates or returns the order. You cannot approve an order, change an amount or mark a payment as made.",
    parameters: jsonSchema(
      {
        quote_id: { type: "string", description: "quote_id returned by get_quote / propose_discount." },
        idempotency_key: {
          type: "string",
          description:
            "Optional stable key for this checkout attempt. Reuse the same key when retrying the same checkout.",
        },
      },
      ["quote_id"],
    ),
    schema: requestCheckoutSchema,
    label: () => "Checkout requested",
    run: async (args: z.infer<typeof requestCheckoutSchema>, ctx) => {
      if (!ctx.buyerSessionId || !ctx.userId) {
        return {
          ok: false,
          error: {
            code: "checkout_unavailable",
            message: "Checkout requires an authenticated buyer session.",
          },
        };
      }
      const { requestCheckout } = await import("@/lib/checkout.server");
      const key =
        args.idempotency_key ??
        `co-${ctx.buyerSessionId.replace(/-/g, "").slice(0, 12)}-${args.quote_id.replace(/-/g, "").slice(0, 12)}`;
      const result = await requestCheckout({
        quoteId: args.quote_id,
        idempotencyKey: key,
        buyerSessionId: ctx.buyerSessionId,
        userId: ctx.userId,
        actorType: "ai_agent",
      });
      if (!result.ok) {
        return {
          ok: true,
          label: `Checkout refused by server (${result.error.code})`,
          data: {
            checkout_created: false,
            error_code: result.error.code,
            reason: result.error.message,
            trace: result.trace,
            checkout_authority: "server",
          },
        };
      }
      const order = result.order;
      return {
        ok: true,
        label:
          order.status === "APPROVAL_REQUIRED"
            ? "Approval required — waiting for merchant"
            : `Order ${order.status.toLowerCase().replace(/_/g, " ")}`,
        data: {
          checkout_created: true,
          idempotent_replay: result.idempotent_replay,
          order,
          trace: result.trace,
          next_step:
            order.status === "APPROVAL_REQUIRED"
              ? "Tell the customer this checkout requires merchant approval because the order value exceeds the merchant's automatic approval threshold."
              : "Tell the customer the order is created and payment is pending. Payment cannot be taken in this phase.",
          checkout_authority: "server",
        },
      };
    },
  },
};


export const TOOL_NAMES = Object.keys(TOOL_REGISTRY) as ToolName[];

export function openAiToolSpecs() {
  return TOOL_NAMES.map((name) => {
    const tool = TOOL_REGISTRY[name];
    return {
      type: "function" as const,
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    };
  });
}

/** Validate + execute one model-requested tool call. Never trusts model input. */
export async function executeTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<{ result: ToolResult; label: string }> {
  if (!TOOL_NAMES.includes(name as ToolName)) {
    return {
      label: "Rejected unregistered tool",
      result: {
        ok: false,
        error: { code: "unknown_tool", message: `Tool "${name}" is not available.` },
      },
    };
  }
  const tool = TOOL_REGISTRY[name as ToolName];

  let parsedArgs: unknown = rawArgs;
  if (typeof rawArgs === "string") {
    try {
      parsedArgs = rawArgs.trim() ? JSON.parse(rawArgs) : {};
    } catch {
      return {
        label: `Invalid arguments for ${tool.name}`,
        result: {
          ok: false,
          error: { code: "invalid_tool_arguments", message: "Tool arguments were not valid JSON." },
        },
      };
    }
  }

  const validated = tool.schema.safeParse(parsedArgs ?? {});
  if (!validated.success) {
    return {
      label: `Invalid arguments for ${tool.name}`,
      result: {
        ok: false,
        error: {
          code: "invalid_tool_arguments",
          message: "Tool arguments failed server-side validation.",
          details: validated.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
      },
    };
  }

  const args = validated.data as Record<string, unknown>;
  try {
    const result = await tool.run(args, ctx);
    return { label: result.label ?? tool.label(args), result };
  } catch (error) {
    console.error(`[agent-tools] ${tool.name} failed`, error);
    return {
      label: `${tool.name} failed`,
      result: {
        ok: false,
        error: { code: "tool_execution_failed", message: "The tool failed to execute." },
      },
    };
  }
}
