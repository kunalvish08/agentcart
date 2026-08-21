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

import { DEFAULT_MERCHANT_SLUG } from "@/lib/public-api.server";

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

const emptySchema = z.object({}).strip();

/* ------------------------------ tool registry ----------------------------- */

export type ToolName =
  | "search_catalog"
  | "get_product"
  | "get_related_products"
  | "get_quote"
  | "get_merchant_info";

export type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

type ToolDefinition = {
  name: ToolName;
  description: string;
  parameters: Record<string, unknown>;
  schema: z.ZodTypeAny;
  label: (args: Record<string, unknown>) => string;
  run: (args: any, ctx: { baseUrl: string }) => Promise<ToolResult>;
};

function jsonSchema(properties: Record<string, unknown>, required: string[]) {
  return { type: "object", properties, required, additionalProperties: false };
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
  ctx: { baseUrl: string },
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
    return { label: tool.label(args), result };
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
