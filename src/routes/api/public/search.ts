import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { ProductRecord } from "@/lib/public-api.server";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(80).optional(),
  max_price: z.coerce.number().positive().max(1_000_000_000).optional(),
  min_price: z.coerce.number().nonnegative().max(1_000_000_000).optional(),
  in_stock: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  merchant: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/i)
    .optional(),
});

/** Deterministic relevance: no LLM involved in catalog filtering. */
function score(
  product: { name: string; description: string | null; category: string | null },
  terms: string[],
): number {
  if (terms.length === 0) return 1;
  const name = product.name.toLowerCase();
  const category = (product.category ?? "").toLowerCase();
  const description = (product.description ?? "").toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (name === term) total += 10;
    else if (name.includes(term)) total += 6;
    if (category.includes(term)) total += 3;
    if (description.includes(term)) total += 1;
  }
  return total;
}

export const Route = createFileRoute("/api/public/search")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/public-api.server");
        return corsPreflight();
      },
      GET: async ({ request }) => {
        const api = await import("@/lib/public-api.server");
        return api.withLogging("/api/public/search", request, async () => {
          if (!api.rateLimit(request, "search", 120)) {
            return {
              response: api.errorResponse(429, "rate_limited", "Too many requests. Try again shortly."),
            };
          }

          const url = new URL(request.url);
          const raw: Record<string, string> = {};
          for (const key of ["q", "category", "max_price", "min_price", "in_stock", "limit", "merchant"]) {
            const value = url.searchParams.get(key);
            if (value !== null) raw[key] = value; // unknown params ignored
          }

          const parsed = querySchema.safeParse(raw);
          if (!parsed.success) {
            return {
              response: api.errorResponse(
                400,
                "invalid_query",
                "Invalid query parameters.",
                parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
              ),
            };
          }
          const { q, category, max_price, min_price, in_stock, limit } = parsed.data;

          const merchant = await api.resolveMerchant(parsed.data.merchant ?? null);
          if (!merchant) {
            return {
              response: api.errorResponse(404, "merchant_not_found", "No public merchant found."),
            };
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let query = supabaseAdmin
            .from("products")
            .select(api.PRODUCT_PUBLIC_COLUMNS)
            .eq("merchant_id", merchant.id)
            .eq("status", "active");

          if (category) query = query.ilike("category", category);
          if (max_price !== undefined) query = query.lte("price", max_price);
          if (min_price !== undefined) query = query.gte("price", min_price);
          if (in_stock === "true") query = query.gt("stock_quantity", 0);

          const { data, error } = await query.limit(200);
          if (error) throw new Error(error.message);

          const terms = (q ?? "")
            .toLowerCase()
            .split(/\s+/)
            .map((t) => t.replace(/[^a-z0-9+.-]/g, ""))
            .filter((t) => t.length > 1)
            .slice(0, 10);

          const scored = (data ?? [])
            .map((row) => ({ row: row as ProductRecord, relevance: score(row, terms) }))
            .filter((entry) => entry.relevance > 0)
            .sort((a, b) => b.relevance - a.relevance || Number(a.row.price) - Number(b.row.price))
            .slice(0, limit);

          return {
            response: api.jsonResponse({
              query: { q: q ?? null, category: category ?? null, max_price: max_price ?? null, min_price: min_price ?? null, in_stock: in_stock ?? null, limit },
              merchant: { name: merchant.name, slug: merchant.slug, currency: merchant.currency },
              count: scored.length,
              results: scored.map((entry, index) => ({
                rank: index + 1,
                relevance_score: entry.relevance,
                ...api.toPublicProduct(entry.row),
              })),
            }),
            merchantId: merchant.id,
          };
        });
      },
    },
  },
});
