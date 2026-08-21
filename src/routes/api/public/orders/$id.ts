// Phase 08 — read-only order observation for external AI buyers.
// The token scopes the read to the buyer's own session; no payment secrets, no
// internal columns, no ability to change anything.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const idSchema = z.string().uuid();

export const Route = createFileRoute("/api/public/orders/$id")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/public-api.server");
        return corsPreflight();
      },
      GET: async ({ request, params }) => {
        const api = await import("@/lib/public-api.server");
        return api.withLogging("/api/public/orders/:id", request, async () => {
          if (!api.rateLimit(request, "order-observe", 120)) {
            return {
              response: api.errorResponse(429, "rate_limited", "Too many requests. Try again shortly."),
            };
          }

          const parsedId = idSchema.safeParse(params.id);
          if (!parsedId.success) {
            return { response: api.errorResponse(400, "invalid_order_id", "order id must be a UUID.") };
          }

          const { verifyAgentSessionToken } = await import("@/lib/agent-session-token.server");
          const auth = await verifyAgentSessionToken(request);
          if (!auth.ok) {
            return {
              response: api.errorResponse(
                401,
                auth.code,
                "A valid X-Agent-Session token is required to observe an order.",
              ),
            };
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: owned } = await supabaseAdmin
            .from("orders")
            .select("id")
            .eq("id", parsedId.data)
            .eq("buyer_session_id", auth.identity.session_id)
            .maybeSingle();
          if (!owned) {
            return {
              response: api.errorResponse(
                404,
                "order_not_found",
                "No order with that id belongs to this agent session.",
              ),
              merchantId: auth.identity.merchant_id,
            };
          }

          const { getOrderSnapshot } = await import("@/lib/checkout.server");
          const order = await getOrderSnapshot(parsedId.data);
          if (!order) {
            return {
              response: api.errorResponse(404, "order_not_found", "Order not found."),
              merchantId: auth.identity.merchant_id,
            };
          }

          return {
            response: api.jsonResponse(
              {
                order: {
                  order_id: order.order_id,
                  status: order.status,
                  currency: order.currency,
                  product_name: order.product_name,
                  quantity: order.quantity,
                  final_amount: order.final_amount,
                  discount_percent: order.discount_percent,
                  approval_required: order.approval_required,
                  approval_status: order.approval_status,
                  payment_state: order.payment_state,
                  created_at: order.created_at,
                  expires_at: order.expires_at,
                },
                amount_authority: "server",
              },
              200,
              "no-store",
            ),
            merchantId: auth.identity.merchant_id,
          };
        });
      },
    },
  },
});
