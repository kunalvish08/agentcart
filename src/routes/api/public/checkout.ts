// Phase 08 — public checkout REQUEST contract for external AI buyers.
//
// A thin wrapper over the frozen Phase 05 checkout logic. The caller supplies a
// server-issued quote_id and an idempotency key — nothing else. It cannot pass an
// amount, cannot approve an order, cannot capture a payment and cannot reach
// Razorpay. Approval remains human-in-the-loop in the merchant UI.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const checkoutSchema = z
  .object({
    quote_id: z.string().uuid("quote_id must be a server-issued quote UUID"),
    idempotency_key: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/, "idempotency_key must be letters, digits, '-' or '_'"),
    buyer_note: z.string().trim().max(400).optional(),
  })
  .strip();

export const Route = createFileRoute("/api/public/checkout")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/public-api.server");
        return corsPreflight();
      },
      POST: async ({ request }) => {
        const api = await import("@/lib/public-api.server");
        return api.withLogging("/api/public/checkout", request, async () => {
          if (!api.rateLimit(request, "checkout", 30)) {
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
          const parsed = checkoutSchema.safeParse(body);
          if (!parsed.success) {
            return {
              response: api.errorResponse(
                400,
                "invalid_request",
                "Invalid checkout request.",
                parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
              ),
            };
          }

          const { verifyAgentSessionToken } = await import("@/lib/agent-session-token.server");
          const auth = await verifyAgentSessionToken(request);
          if (!auth.ok) {
            return {
              response: api.errorResponse(
                401,
                auth.code,
                "A valid X-Agent-Session token is required to request checkout.",
              ),
            };
          }

          const { requestCheckout } = await import("@/lib/checkout.server");
          const result = await requestCheckout({
            quoteId: parsed.data.quote_id,
            idempotencyKey: parsed.data.idempotency_key,
            buyerSessionId: auth.identity.session_id,
            userId: auth.identity.user_id,
            actorType: "ai_agent",
            customerRequestSummary: parsed.data.buyer_note ?? null,
          });

          if (!result.ok) {
            const status =
              result.error.code === "quote_not_found"
                ? 404
                : result.error.code.startsWith("invalid")
                  ? 400
                  : 409;
            return {
              response: api.jsonResponse(
                {
                  accepted: false,
                  error: result.error,
                  trace: result.trace,
                  authority: "server",
                },
                status,
                "no-store",
              ),
              merchantId: auth.identity.merchant_id,
            };
          }

          const order = result.order;
          const approvalRequired = order.status === "APPROVAL_REQUIRED";
          return {
            response: api.jsonResponse(
              {
                accepted: true,
                idempotent_replay: result.idempotent_replay,
                order: {
                  order_id: order.order_id,
                  status: order.status,
                  merchant: order.merchant,
                  currency: order.currency,
                  product_id: order.product_id,
                  product_name: order.product_name,
                  quantity: order.quantity,
                  unit_price: order.unit_price,
                  subtotal_amount: order.subtotal_amount,
                  discount_amount: order.discount_amount,
                  discount_percent: order.discount_percent,
                  final_amount: order.final_amount,
                  approval_required: order.approval_required,
                  approval_reason: order.approval_reason,
                  approval_status: order.approval_status,
                  quote_id: order.quote_id,
                  expires_at: order.expires_at,
                  payment_state: order.payment_state,
                },
                next_action: approvalRequired
                  ? "Merchant approval required before payment."
                  : "Awaiting payment through the merchant's payment flow.",
                buyer_agent_may_approve: false,
                buyer_agent_may_capture_payment: false,
                amount_authority: "server",
                trace: result.trace,
                observe_endpoint: `/api/public/orders/${order.order_id}`,
              },
              approvalRequired ? 202 : 201,
              "no-store",
            ),
            merchantId: auth.identity.merchant_id,
          };
        });
      },
    },
  },
});
