import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const idSchema = z.string().uuid();

export const Route = createFileRoute("/api/public/products/$id")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/public-api.server");
        return corsPreflight();
      },
      GET: async ({ request, params }) => {
        const api = await import("@/lib/public-api.server");
        return api.withLogging("/api/public/products/:id", request, async () => {
          if (!api.rateLimit(request, "product", 180)) {
            return {
              response: api.errorResponse(429, "rate_limited", "Too many requests. Try again shortly."),
            };
          }

          const parsedId = idSchema.safeParse(params.id);
          if (!parsedId.success) {
            return {
              response: api.errorResponse(400, "invalid_product_id", "product id must be a UUID."),
            };
          }

          const url = new URL(request.url);
          const merchant = await api.resolveMerchant(url.searchParams.get("merchant"));
          if (!merchant) {
            return {
              response: api.errorResponse(404, "merchant_not_found", "No public merchant found."),
            };
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("products")
            .select(api.PRODUCT_PUBLIC_COLUMNS)
            .eq("id", parsedId.data)
            .eq("merchant_id", merchant.id)
            .eq("status", "active")
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!data) {
            return {
              response: api.errorResponse(
                404,
                "product_not_found",
                "Product not found or not publicly available.",
              ),
              merchantId: merchant.id,
            };
          }

          const policy = await api.getPolicy(merchant.id);
          const related = await api.fetchRelatedProducts(
            merchant.id,
            parsedId.data,
            policy.allow_upsell,
          );

          return {
            response: api.jsonResponse({
              merchant: { name: merchant.name, slug: merchant.slug, currency: merchant.currency },
              product: api.toPublicProduct(data as api.ProductRecord),
              related_products: related,
              quote_endpoint: "/api/public/quote",
            }),
            merchantId: merchant.id,
          };
        });
      },
    },
  },
});
