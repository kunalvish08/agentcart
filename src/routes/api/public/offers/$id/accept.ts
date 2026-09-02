// Public endpoint: buyer explicitly accepts (or rejects) a countered offer.
// Thin wrapper over respondToOffer — the server re-checks policy + inventory
// and issues a fresh quote_id. Buyer never supplies a price or discount.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({ action: z.enum(["accept", "reject"]).default("accept") }).strip();

export const Route = createFileRoute("/api/public/offers/$id/accept")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/public-api.server");
        return corsPreflight();
      },
      POST: async ({ request, params }) => {
        const api = await import("@/lib/public-api.server");
        return api.withLogging("/api/public/offers/:id/accept", request, async () => {
          if (!api.rateLimit(request, "offer-accept", 40)) {
            return { response: api.errorResponse(429, "rate_limited", "Too many requests.") };
          }
          const idParsed = z.string().uuid().safeParse(params.id);
          if (!idParsed.success) {
            return { response: api.errorResponse(400, "invalid_offer_id", "offer id must be a UUID.") };
          }

          const text = await request.text();
          let body: unknown = {};
          if (text) {
            try { body = JSON.parse(text); } catch {
              return { response: api.errorResponse(400, "invalid_json", "Request body must be JSON.") };
            }
          }
          const parsed = bodySchema.safeParse(body);
          if (!parsed.success) {
            return { response: api.errorResponse(400, "invalid_request", "Invalid offer response.") };
          }

          const { verifyAgentSessionToken } = await import("@/lib/agent-session-token.server");
          const auth = await verifyAgentSessionToken(request);
          if (!auth.ok) {
            return {
              response: api.errorResponse(401, auth.code, "A valid X-Agent-Session token is required."),
            };
          }

          const merchant = await api.resolveMerchant(null);
          if (!merchant || merchant.id !== auth.identity.merchant_id) {
            return { response: api.errorResponse(403, "merchant_mismatch", "Merchant mismatch.") };
          }

          const { respondToOffer } = await import("@/lib/negotiation.server");
          const result = await respondToOffer({
            merchant,
            buyerSessionId: auth.identity.session_id,
            baseUrl: new URL(request.url).origin,
            offerId: idParsed.data,
            action: parsed.data.action,
          });
          if (!result.ok) {
            return {
              response: api.errorResponse(409, result.error.code, result.error.message),
              merchantId: merchant.id,
            };
          }
          return {
            response: api.jsonResponse(result.data, 200, "no-store"),
            merchantId: merchant.id,
          };
        });
      },
    },
  },
});
