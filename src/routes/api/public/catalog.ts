import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const querySchema = z.object({
  merchant: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, "Invalid merchant slug")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export const Route = createFileRoute("/api/public/catalog")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/public-api.server");
        return corsPreflight();
      },
      GET: async ({ request }) => {
        const api = await import("@/lib/public-api.server");
        return api.withLogging("/api/public/catalog", request, async () => {
          if (!api.rateLimit(request, "catalog", 120)) {
            return {
              response: api.errorResponse(429, "rate_limited", "Too many requests. Try again shortly."),
            };
          }

          const url = new URL(request.url);
          const parsed = querySchema.safeParse({
            merchant: url.searchParams.get("merchant") ?? undefined,
            limit: url.searchParams.get("limit") ?? undefined,
            offset: url.searchParams.get("offset") ?? undefined,
          });
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

          const merchant = await api.resolveMerchant(parsed.data.merchant ?? null);
          if (!merchant) {
            return {
              response: api.errorResponse(404, "merchant_not_found", "No public merchant found."),
            };
          }

          const policy = await api.getPolicy(merchant.id);
          const all = await api.fetchActiveProducts(merchant.id);
          const page = all.slice(parsed.data.offset, parsed.data.offset + parsed.data.limit);

          const relationRows = await Promise.all(
            page.map((p) => api.fetchRelatedProducts(merchant.id, p.id, policy.allow_upsell)),
          );

          const items = page.map((row, index) => ({
            ...api.toPublicProduct(row),
            related_products: (relationRows[index] ?? []).map((r) => ({
              relation_type: r.relation_type,
              product_id: r.product_id,
              name: r.name,
              price: r.price,
              currency: r.currency,
              availability: r.availability,
            })),
          }));

          return {
            response: api.jsonResponse({
              merchant: {
                name: merchant.name,
                slug: merchant.slug,
                description: merchant.description,
                currency: merchant.currency,
              },
              commerce_policy: {
                negotiation_enabled: policy.allow_negotiation,
                upsell_enabled: policy.allow_upsell,
              },
              pagination: {
                total: all.length,
                limit: parsed.data.limit,
                offset: parsed.data.offset,
                returned: items.length,
              },
              products: items,
            }),
            merchantId: merchant.id,
          };
        });
      },
    },
  },
});
