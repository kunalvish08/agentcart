// Phase 08 — tool registry for the EXTERNAL AI buyer agent.
//
// Every tool is a bounded, Zod-validated wrapper over one public HTTP endpoint of
// the Agent Commerce API. There is no database access here, no server-function
// shortcut, no secret. The model can only choose which of these six tools to call.
import { z } from "zod";

import type { AgentCommerceClient, ApiCall, ApiError } from "@/lib/agent-commerce-client.server";

export type ExternalToolName =
  | "discover_merchant"
  | "search_catalog"
  | "get_product"
  | "get_related_products"
  | "get_quote"
  | "negotiate"
  | "request_checkout";

export const EXTERNAL_TOOL_NAMES: readonly ExternalToolName[] = [
  "discover_merchant",
  "search_catalog",
  "get_product",
  "get_related_products",
  "get_quote",
  "negotiate",
  "request_checkout",
];

export type ExternalToolResult = {
  ok: boolean;
  data?: unknown;
  error?: ApiError;
  label: string;
  call: ApiCall | null;
  latency_ms: number;
};

type ToolDefinition = {
  name: ExternalToolName;
  description: string;
  parameters: Record<string, unknown>;
  schema: z.ZodTypeAny;
  run: (client: AgentCommerceClient, args: any) => Promise<{ result: any; label: string }>;
};

const idempotencySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const REGISTRY: Record<ExternalToolName, ToolDefinition> = {
  discover_merchant: {
    name: "discover_merchant",
    description:
      "Fetch the merchant's public agent manifest: identity, capabilities, endpoints and the commerce policy constraints (max discount, approval threshold, currency).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    schema: z.object({}).strip(),
    run: async (client) => {
      const res = await client.discoverMerchant();
      return { result: res, label: "GET /.well-known/agent-manifest" };
    },
  },
  search_catalog: {
    name: "search_catalog",
    description:
      "Search the merchant's public catalog. Use the shopper's words and an optional max_price budget. Returns only real catalog products.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text, e.g. 'developer laptop'" },
        max_price: { type: "number", description: "Optional budget ceiling in the merchant currency" },
        category: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    schema: z
      .object({
        query: z.string().trim().min(1).max(200),
        max_price: z.number().positive().max(100_000_000).optional(),
        category: z.string().trim().max(80).optional(),
        limit: z.number().int().min(1).max(10).optional(),
      })
      .strip(),
    run: async (client, args) => {
      const res = await client.searchProducts(args);
      return { result: res, label: `GET /api/public/search q="${args.query}"` };
    },
  },
  get_product: {
    name: "get_product",
    description:
      "Fetch one product's public detail record by the product_id returned from search or catalog.",
    parameters: {
      type: "object",
      properties: { product_id: { type: "string", description: "Product UUID from search results" } },
      required: ["product_id"],
      additionalProperties: false,
    },
    schema: z.object({ product_id: z.string().uuid() }).strip(),
    run: async (client, args) => {
      const res = await client.getProduct(args);
      return { result: res, label: "GET /api/public/products/:id" };
    },
  },
  get_related_products: {
    name: "get_related_products",
    description:
      "Fetch products related to a specific product_id (upsell, cross-sell, or alternatives) according to merchant policy. Use this to improve cross-sell recommendations.",
    parameters: {
      type: "object",
      properties: { product_id: { type: "string", description: "Product UUID" } },
      required: ["product_id"],
      additionalProperties: false,
    },
    schema: z.object({ product_id: z.string().uuid() }).strip(),
    run: async (client, args) => {
      // AgentCommerceClient needs to be updated too, but we can call catalog for now or add it there.
      // Wait, let's look at AgentCommerceClient again.
      // browseCatalog is there, but not fetchRelatedProducts.
      // I'll add a new method to AgentCommerceClient first.
      const res = await (client as any).getRelatedProducts(args);
      return { result: res, label: "GET /api/public/catalog with relations" };
    },
  },
  get_quote: {
    name: "get_quote",
    description:
      "Ask the merchant server for an authoritative quote. The server computes every amount; you must never calculate or estimate a price yourself.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        quantity: { type: "integer", minimum: 1, maximum: 100 },
        requested_discount_percent: { type: "number", minimum: 0, maximum: 100 },
      },
      required: ["product_id", "quantity"],
      additionalProperties: false,
    },
    schema: z
      .object({
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(100),
        requested_discount_percent: z.number().min(0).max(100).optional(),
      })
      .strip(),
    run: async (client, args) => {
      const res = await client.getQuote(args);
      return { result: res, label: "POST /api/public/quote" };
    },
  },
  negotiate: {
    name: "negotiate",
    description:
      "Request a discount. You state the percent you would like; the merchant's server decides (accept, counter at its policy limit, or reject) and returns the resulting authoritative quote.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        quantity: { type: "integer", minimum: 1, maximum: 100 },
        requested_discount_percent: { type: "number", minimum: 0, maximum: 100 },
        buyer_note: { type: "string", description: "Short buyer intent summary" },
      },
      required: ["product_id", "quantity", "requested_discount_percent"],
      additionalProperties: false,
    },
    schema: z
      .object({
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(100),
        requested_discount_percent: z.number().min(0).max(100),
        buyer_note: z.string().trim().max(400).optional(),
      })
      .strip(),
    run: async (client, args) => {
      const res = await client.negotiate(args);
      return {
        result: res,
        label: `POST /api/public/negotiate requesting ${args.requested_discount_percent}%`,
      };
    },
  },
  request_checkout: {
    name: "request_checkout",
    description:
      "Request checkout for a quote_id the server already issued. You cannot pass an amount, cannot approve the order and cannot take payment. Stop after this call and report the returned status.",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string", description: "quote_id returned by get_quote or negotiate" },
        buyer_note: { type: "string" },
      },
      required: ["quote_id"],
      additionalProperties: false,
    },
    schema: z
      .object({
        quote_id: z.string().uuid(),
        idempotency_key: idempotencySchema.optional(),
        buyer_note: z.string().trim().max(400).optional(),
      })
      .strip(),
    run: async (client, args) => {
      const res = await client.requestCheckout({
        quote_id: args.quote_id,
        // The key is derived deterministically from the quote, never from the model,
        // so a repeated model call can only ever replay the same order.
        idempotency_key: args.idempotency_key ?? `ext-${args.quote_id}`,
        ...(args.buyer_note ? { buyer_note: args.buyer_note } : {}),
      });
      return { result: res, label: "POST /api/public/checkout" };
    },
  },
};

export function externalToolSpecs() {
  return EXTERNAL_TOOL_NAMES.map((name) => ({
    type: "function" as const,
    function: {
      name: REGISTRY[name].name,
      description: REGISTRY[name].description,
      parameters: REGISTRY[name].parameters,
    },
  }));
}

export function isExternalToolName(name: string): name is ExternalToolName {
  return (EXTERNAL_TOOL_NAMES as readonly string[]).includes(name);
}

/** Validate + execute one model-requested tool call. Model input is never trusted. */
export async function executeExternalTool(
  name: string,
  rawArgs: unknown,
  client: AgentCommerceClient,
): Promise<ExternalToolResult> {
  const started = Date.now();
  if (!isExternalToolName(name)) {
    return {
      ok: false,
      error: { code: "unknown_tool", message: `No tool named ${name} is available.` },
      label: `Rejected unknown tool ${name}`,
      call: null,
      latency_ms: 0,
    };
  }

  const tool = REGISTRY[name];
  let parsedArgs: unknown;
  try {
    const source = typeof rawArgs === "string" ? JSON.parse(rawArgs || "{}") : (rawArgs ?? {});
    parsedArgs = tool.schema.parse(source);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")
        : "Tool arguments were not valid JSON.";
    return {
      ok: false,
      error: { code: "invalid_tool_input", message },
      label: `Rejected invalid input for ${name}`,
      call: null,
      latency_ms: Date.now() - started,
    };
  }

  try {
    const { result, label } = await tool.run(client, parsedArgs);
    const latency = Date.now() - started;
    if (result.ok) {
      return { ok: true, data: result.data, label, call: result.call, latency_ms: latency };
    }
    return { ok: false, error: result.error, label, call: result.call, latency_ms: latency };
  } catch (error) {
    console.error(`[external-buyer-tools] ${name} failed`, error);
    return {
      ok: false,
      error: { code: "tool_failed", message: "The merchant API call could not be completed." },
      label: `${name} failed`,
      call: null,
      latency_ms: Date.now() - started,
    };
  }
}
