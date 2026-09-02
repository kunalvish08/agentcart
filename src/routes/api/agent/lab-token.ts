// Authenticated helper: mints a fresh buyer session + X-Agent-Session token for
// standalone/lab clients that consume the public Agent Commerce API without a UI.
// The caller must present a valid Supabase user bearer token. The minted token
// has the same authority envelope as any other buyer-lab session.
import { createFileRoute } from "@tanstack/react-router";

function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/agent/lab-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return jsonError(401, "unauthorized", "Authentication required.");
        }
        const token = authHeader.slice(7).trim();
        if (token.split(".").length !== 3) {
          return jsonError(401, "unauthorized", "Invalid session token.");
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabaseUrl = process.env["SUPABASE_URL"];
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !publishableKey) {
          return jsonError(500, "not_configured", "Backend is not configured.");
        }
        const authClient = createClient(supabaseUrl, publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
        const userId = claimsData?.claims?.sub;
        if (claimsError || !userId) {
          return jsonError(401, "unauthorized", "Invalid session token.");
        }

        const { resolveMerchant, DEFAULT_MERCHANT_SLUG } = await import("@/lib/public-api.server");
        const merchant = await resolveMerchant(DEFAULT_MERCHANT_SLUG);
        if (!merchant) return jsonError(503, "merchant_unavailable", "No public merchant available.");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: session, error: sessErr } = await supabaseAdmin
          .from("agent_sessions")
          .insert({
            user_id: userId,
            merchant_id: merchant.id,
            title: "Standalone buyer script",
            status: "running",
          })
          .select("id")
          .single();
        if (sessErr || !session) return jsonError(500, "session_failed", "Could not open buyer session.");

        const { mintAgentSessionToken } = await import("@/lib/agent-session-token.server");
        const { token: agentToken, expiresAt } = await mintAgentSessionToken(session.id);

        return new Response(
          JSON.stringify({
            session_id: session.id,
            merchant_slug: merchant.slug,
            currency: merchant.currency,
            agent_session_token: agentToken,
            expires_at: new Date(expiresAt).toISOString(),
          }),
          { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } },
        );
      },
    },
  },
});
