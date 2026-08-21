// Phase 06 — Razorpay webhook receiver (public prefix: Razorpay is an external caller).
//
// SECURITY
// - The RAW request body is read first and used verbatim for HMAC-SHA256 verification;
//   JSON is only parsed after the signature passes.
// - No private data is ever returned: the response body is a small status envelope.
// - Duplicate deliveries are acknowledged without re-processing (webhook_events).
// - Nothing here trusts the payload for money: amounts are matched against the
//   authoritative order before any state changes.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // RAW body first — parsing before verification would break the signature.
        const rawBody = await request.text();
        if (rawBody.length > 100_000) {
          return Response.json({ ok: false, status: "payload_too_large" }, { status: 413 });
        }

        const { handleRazorpayWebhook } = await import("@/lib/payments.server");
        const result = await handleRazorpayWebhook({
          rawBody,
          signature: request.headers.get("x-razorpay-signature"),
          deliveryId: request.headers.get("x-razorpay-event-id"),
        });

        return Response.json(result.body, {
          status: result.status,
          headers: { "cache-control": "no-store" },
        });
      },
      GET: async () =>
        Response.json(
          { ok: true, endpoint: "razorpay-webhook", method: "POST", mode: "test" },
          { headers: { "cache-control": "no-store" } },
        ),
    },
  },
});
