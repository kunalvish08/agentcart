import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Any client-supplied price/total/amount field is deliberately NOT part of the
// schema: monetary values are always computed server-side.
const quoteSchema = z
  .object({
    product_id: z.string().uuid("product_id must be a UUID"),
    quantity: z.number().int("quantity must be a whole number").min(1).max(1000),
    requested_discount_percent: z.number().min(0).max(100).default(0),
    merchant: z
      .string()
      .trim()
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/i)
      .optional(),
  })
  .strip();

export const Route = createFileRoute("/api/public/quote")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/public-api.server");
        return corsPreflight();
      },
      POST: async ({ request }) => {
        const api = await import("@/lib/public-api.server");
        return api.withLogging("/api/public/quote", request, async () => {
          if (!api.rateLimit(request, "quote", 60)) {
            return {
              response: api.errorResponse(429, "rate_limited", "Too many requests. Try again shortly."),
            };
          }

          const text = await request.text();
          if (text.length > 4000) {
            return { response: api.errorResponse(413, "payload_too_large", "Request body too large.") };
          }

          let body: unknown;
          try {
            body = JSON.parse(text || "{}");
          } catch {
            return { response: api.errorResponse(400, "invalid_json", "Request body must be JSON.") };
          }

          const parsed = quoteSchema.safeParse(body);
          if (!parsed.success) {
            return {
              response: api.errorResponse(
                400,
                "invalid_request",
                "Invalid quote request.",
                parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
              ),
            };
          }
          const { product_id, quantity, requested_discount_percent } = parsed.data;

          const merchant = await api.resolveMerchant(parsed.data.merchant ?? null);
          if (!merchant) {
            return {
              response: api.errorResponse(404, "merchant_not_found", "No public merchant found."),
            };
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: product, error } = await supabaseAdmin
            .from("products")
            .select("id, name, price, currency, stock_quantity, status")
            .eq("id", product_id)
            .eq("merchant_id", merchant.id)
            .maybeSingle();
          if (error) throw new Error(error.message);

          if (!product) {
            return {
              response: api.errorResponse(404, "product_not_found", "Product not found."),
              merchantId: merchant.id,
            };
          }
          if (product.status !== "active") {
            return {
              response: api.errorResponse(409, "product_inactive", "Product is not available for sale."),
              merchantId: merchant.id,
            };
          }
          if (product.stock_quantity < quantity) {
            return {
              response: api.errorResponse(409, "insufficient_inventory", "Not enough inventory.", {
                requested_quantity: quantity,
                available_quantity: product.stock_quantity,
              }),
              merchantId: merchant.id,
            };
          }

          const policy = await api.getPolicy(merchant.id);

          // ---- Server-side, integer (paise) monetary computation ----
          const unitMinor = api.toMinor(product.price as unknown as string);
          const baseMinor = unitMinor * quantity;

          const policyCap = policy.allow_negotiation ? policy.max_discount_percent : 0;
          const allowedDiscount = Math.min(requested_discount_percent, policyCap);
          const finalMinor = api.applyDiscountMinor(baseMinor, allowedDiscount);

          const reasons: string[] = [];
          if (!policy.allow_negotiation && requested_discount_percent > 0) {
            reasons.push("Negotiation is disabled by merchant policy; no discount applied.");
          } else if (requested_discount_percent > policyCap) {
            reasons.push(
              `Requested discount ${requested_discount_percent}% exceeds the merchant limit of ${policyCap}%; capped at ${policyCap}%.`,
            );
          } else if (allowedDiscount > 0) {
            reasons.push(`Requested discount ${allowedDiscount}% is within merchant policy.`);
          } else {
            reasons.push("No discount requested; list price applied.");
          }

          const exceedsMaxOrder =
            policy.max_order_value > 0 && api.fromMinor(finalMinor) > policy.max_order_value;
          if (exceedsMaxOrder) {
            reasons.push(
              `Order total exceeds the merchant maximum order value of ${policy.max_order_value}.`,
            );
          }
          const requiresApproval =
            policy.approval_required_above > 0 &&
            api.fromMinor(finalMinor) > policy.approval_required_above;
          if (requiresApproval) {
            reasons.push(
              `Order total exceeds ${policy.approval_required_above} and requires merchant approval.`,
            );
          }

          if (exceedsMaxOrder) {
            return {
              response: api.errorResponse(
                409,
                "order_value_exceeded",
                "Quote exceeds the merchant maximum order value.",
                {
                  max_order_value: policy.max_order_value,
                  currency: merchant.currency,
                },
              ),
              merchantId: merchant.id,
            };
          }

          const expiresAt = new Date(Date.now() + api.QUOTE_TTL_MINUTES * 60_000).toISOString();

          const { data: quote, error: quoteError } = await supabaseAdmin
            .from("quotes")
            .insert({
              merchant_id: merchant.id,
              product_id: product.id,
              quantity,
              unit_price: api.fromMinor(unitMinor),
              base_amount: api.fromMinor(baseMinor),
              requested_discount_percent,
              allowed_discount_percent: allowedDiscount,
              final_amount: api.fromMinor(finalMinor),
              currency: product.currency,
              policy_applied: allowedDiscount !== requested_discount_percent || requiresApproval,
              policy_reason: reasons.join(" "),
              expires_at: expiresAt,
            })
            .select("id, created_at")
            .single();
          if (quoteError) throw new Error(quoteError.message);

          return {
            response: api.jsonResponse(
              {
                quote_id: quote.id,
                merchant: merchant.slug,
                product_id: product.id,
                product_name: product.name,
                quantity,
                unit_price: api.fromMinor(unitMinor),
                base_amount: api.fromMinor(baseMinor),
                requested_discount_percent,
                allowed_discount_percent: allowedDiscount,
                discount_amount: api.fromMinor(baseMinor - finalMinor),
                final_amount: api.fromMinor(finalMinor),
                currency: product.currency,
                policy_applied: allowedDiscount !== requested_discount_percent || requiresApproval,
                policy_reason: reasons.join(" "),
                requires_merchant_approval: requiresApproval,
                pricing_authority: "server",
                created_at: quote.created_at,
                expires_at: expiresAt,
              },
              200,
              "no-store",
            ),
            merchantId: merchant.id,
          };
        });
      },
    },
  },
});
