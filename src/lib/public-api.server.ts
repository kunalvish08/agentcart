// Server-only helpers for the public agent-commerce API.
// This module is never bundled for the browser (*.server.ts).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const DEFAULT_MERCHANT_SLUG = "technova-store";
export const QUOTE_TTL_MINUTES = 15;

export type PublicMerchant = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  currency: string;
};

export type PublicPolicy = {
  max_discount_percent: number;
  max_order_value: number;
  approval_required_above: number;
  allow_negotiation: boolean;
  allow_upsell: boolean;
  merchant_agent_commerce_enabled: boolean;
};

/* ------------------------------ money helpers ----------------------------- */

/** Convert a decimal amount (rupees) into integer minor units (paise). */
export function toMinor(amount: number | string): number {
  const value = typeof amount === "string" ? amount : amount.toFixed(2);
  const [whole, frac = ""] = value.split(".");
  const sign = whole?.startsWith("-") ? -1 : 1;
  const w = BigInt((whole ?? "0").replace("-", "") || "0");
  const f = BigInt(((frac + "00").slice(0, 2)) || "0");
  return sign * Number(w * 100n + f);
}

/** Format integer minor units back to a decimal number with 2 dp. */
export function fromMinor(minor: number): number {
  return Number((minor / 100).toFixed(2));
}

/** Apply a percent discount to minor units, rounding half-up to the paisa. */
export function applyDiscountMinor(baseMinor: number, percent: number): number {
  const pct = Math.round(percent * 100); // percent in basis-points-of-percent
  const discount = Math.round((baseMinor * pct) / 10000);
  return Math.max(0, baseMinor - discount);
}

/* ------------------------------ HTTP helpers ------------------------------ */

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=30",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200, cache = JSON_HEADERS["cache-control"]) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...JSON_HEADERS,
      "cache-control": cache,
      // Correlation id for agent-to-agent traces. Carries no user or secret data.
      "x-request-id": crypto.randomUUID(),
      "access-control-expose-headers": "x-request-id",
    },
  });
}


export function errorResponse(status: number, code: string, message: string, details?: unknown) {
  return jsonResponse({ error: { code, message, ...(details ? { details } : {}) } }, status, "no-store");
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

/* ------------------------------ rate limiting ----------------------------- */
// Best-effort, per-worker-instance sliding window. Public endpoints are
// read-mostly and cheap; this only blunts obvious abuse bursts.
const buckets = new Map<string, number[]>();
const WINDOW_MS = 60_000;

export function rateLimit(request: Request, key: string, max: number): boolean {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const id = `${key}:${ip}`;
  const now = Date.now();
  const hits = (buckets.get(id) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  buckets.set(id, hits);
  if (buckets.size > 5000) buckets.clear();
  return hits.length <= max;
}

/* ------------------------------ observability ----------------------------- */

export async function logApiRequest(entry: {
  endpoint: string;
  method: string;
  status: number;
  startedAt: number;
  merchantId?: string | null;
}) {
  try {
    await supabaseAdmin.from("api_request_logs").insert({
      endpoint: entry.endpoint,
      method: entry.method,
      status_code: entry.status,
      success: entry.status < 400,
      latency_ms: Math.max(0, Math.round(Date.now() - entry.startedAt)),
      merchant_id: entry.merchantId ?? null,
    });
  } catch (error) {
    console.error("[public-api] failed to write request log", error);
  }
}

/** Wraps a handler with timing + request logging. Never logs bodies or secrets. */
export async function withLogging(
  endpoint: string,
  request: Request,
  run: () => Promise<{ response: Response; merchantId?: string | null }>,
): Promise<Response> {
  const startedAt = Date.now();
  try {
    const { response, merchantId } = await run();
    await logApiRequest({
      endpoint,
      method: request.method,
      status: response.status,
      startedAt,
      merchantId: merchantId ?? null,
    });
    return response;
  } catch (error) {
    console.error(`[public-api] ${endpoint} failed`, error);
    await logApiRequest({ endpoint, method: request.method, status: 500, startedAt });
    return errorResponse(500, "internal_error", "The request could not be completed.");
  }
}

/* ------------------------------ data access ------------------------------- */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Resolves a merchant from a safe public slug. Never accepts a raw merchant_id.
 * Only active, agent-commerce-enabled merchants are resolvable.
 */
export async function resolveMerchant(slugInput?: string | null): Promise<PublicMerchant | null> {
  const slug = (slugInput ?? DEFAULT_MERCHANT_SLUG).toLowerCase();
  if (!SLUG_RE.test(slug)) return null;

  const { data, error } = await supabaseAdmin
    .from("merchants")
    .select("id, slug, name, description, currency")
    .eq("slug", slug)
    .eq("status", "active")
    .eq("agent_commerce_enabled", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.slug) return null;
  return { ...data, slug: data.slug };
}

export async function getPolicy(merchantId: string): Promise<PublicPolicy> {
  const { data, error } = await supabaseAdmin
    .from("merchant_policies")
    .select(
      "max_discount_percent, max_order_value, approval_required_above, allow_negotiation, allow_upsell",
    )
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    max_discount_percent: Number(data?.max_discount_percent ?? 0),
    max_order_value: Number(data?.max_order_value ?? 0),
    approval_required_above: Number(data?.approval_required_above ?? 0),
    allow_negotiation: data?.allow_negotiation ?? false,
    allow_upsell: data?.allow_upsell ?? false,
  };
}

/** Only public, safe columns are ever selected from products. */
export const PRODUCT_PUBLIC_COLUMNS =
  "id, name, description, category, price, currency, stock_quantity, metadata, updated_at";

export type ProductRecord = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | string;
  currency: string;
  stock_quantity: number;
  metadata: unknown;
  updated_at: string;
};

export function stockStatus(qty: number): "in_stock" | "low_stock" | "out_of_stock" {
  if (qty <= 0) return "out_of_stock";
  if (qty <= 5) return "low_stock";
  return "in_stock";
}

export function publicAttributes(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (/secret|token|key|internal|owner|cost|margin/i.test(key)) continue;
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) out[key] = value;
  }
  return out;
}

export function toPublicProduct(row: ProductRecord) {
  return {
    product_id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    price: Number(row.price),
    currency: row.currency,
    availability: row.stock_quantity > 0 ? "available" : "unavailable",
    stock_status: stockStatus(row.stock_quantity),
    in_stock: row.stock_quantity > 0,
    attributes: publicAttributes(row.metadata),
    last_updated: row.updated_at,
  };
}

export async function fetchActiveProducts(merchantId: string) {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(PRODUCT_PUBLIC_COLUMNS)
    .eq("merchant_id", merchantId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductRecord[];
}

/**
 * Related products (upsell / cross-sell / alternative) for one product,
 * limited to active products of the same merchant.
 */
export async function fetchRelatedProducts(merchantId: string, productId: string, allowUpsell: boolean) {
  const { data, error } = await supabaseAdmin
    .from("product_relations")
    .select("relation_type, priority, related_product_id")
    .eq("product_id", productId)
    .order("priority", { ascending: false });
  if (error) throw new Error(error.message);

  const relations = data ?? [];
  const ids = relations.map((r) => r.related_product_id);
  if (ids.length === 0) return [];

  const { data: related, error: relatedError } = await supabaseAdmin
    .from("products")
    .select(PRODUCT_PUBLIC_COLUMNS)
    .in("id", ids)
    .eq("merchant_id", merchantId)
    .eq("status", "active");
  if (relatedError) throw new Error(relatedError.message);

  const byId = new Map((related ?? []).map((p) => [p.id, p as ProductRecord]));
  return relations
    .filter((r) => byId.has(r.related_product_id))
    .filter((r) => allowUpsell || r.relation_type !== "upsell")
    .map((r) => ({
      relation_type: r.relation_type,
      priority: r.priority,
      ...toPublicProduct(byId.get(r.related_product_id)!),
    }));
}
