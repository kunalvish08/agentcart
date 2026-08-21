// Phase 08 — public negotiation contract for external AI buyers.
//
// This is a THIN wrapper: every policy decision and every monetary figure comes
// from the frozen Phase 02/04 server logic (quote endpoint + negotiation engine).
// The caller may only *request* a discount percent; it can never set one.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const negotiateSchema = z
  .object({
    product_id: z.string().uuid("product_id must be a UUID"),
    quantity: z.number().int().min(1).max(1000).default(1),
    requested_discount_percent: z.number().min(0).max(100),
    merchant: z
      .string()
      .trim()
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/i)
      .optional(),
    buyer_note: z.string().trim().max(400).optional(),
  })
  .strip();

export const Route = createFileRoute("/api/public/negotiate")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/public-api.server");
        return corsPreflight();
      },
      POST: async ({ request }) => {
        const api = await import("@/lib/public-api.server");
        return api.withLogging("/api/public/negotiate", request, async () => {
          if (!api.rateLimit(request, "negotiate", 40)) {
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
          const parsed = negotiateSchema.safeParse(body);
          if (!parsed.success) {
            return {
              response: api.errorResponse(
                400,
                "invalid_request",
                "Invalid negotiation request.",
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
                "A valid X-Agent-Session token is required to negotiate.",
              ),
            };
          }

          const merchant = await api.resolveMerchant(parsed.data.merchant ?? null);
          if (!merchant) {
            return { response: api.errorResponse(404, "merchant_not_found", "No public merchant found.") };
          }
          if (merchant.id !== auth.identity.merchant_id) {
            return {
              response: api.errorResponse(
                403,
                "merchant_mismatch",
                "This agent session belongs to a different merchant.",
              ),
            };
          }

          const { runNegotiationRound, MAX_NEGOTIATION_ROUNDS } = await import(
            "@/lib/negotiation.server"
          );
          const outcome = await runNegotiationRound({
            merchant,
            buyerSessionId: auth.identity.session_id,
            baseUrl: new URL(request.url).origin,
            productId: parsed.data.product_id,
            quantity: parsed.data.quantity,
            requestedDiscountPercent: parsed.data.requested_discount_percent,
            ...(parsed.data.buyer_note ? { customerRequestSummary: parsed.data.buyer_note } : {}),
          });

          return {
            response: api.jsonResponse(
              {
                merchant: merchant.slug,
                currency: merchant.currency,
                max_rounds: MAX_NEGOTIATION_ROUNDS,
                ...outcome,
                policy_authority: "server",

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
