// Phase 08 — authenticated SSE endpoint that *hosts* the external buyer agent.
//
// The lab itself is a protected merchant tool, so this endpoint requires a Supabase
// bearer token. The agent it hosts is still external in the architectural sense:
// it reaches AgentCart only through the public HTTP Agent Commerce API.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(600),
  scenario_id: z.string().trim().max(60).nullish(),
});

function jsonError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/agent/external-buyer")({
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

        const text = await request.text();
        if (text.length > 8000) {
          return jsonError(413, "payload_too_large", "Request body too large.");
        }
        let raw: unknown;
        try {
          raw = JSON.parse(text || "{}");
        } catch {
          return jsonError(400, "invalid_json", "Request body must be JSON.");
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return jsonError(400, "invalid_request", "Invalid external buyer request.");
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

        const { rateLimit } = await import("@/lib/public-api.server");
        if (!rateLimit(request, "external-buyer", 15)) {
          return jsonError(429, "rate_limited", "Too many external buyer runs. Try again shortly.");
        }

        const { runExternalBuyer } = await import("@/lib/external-buyer.server");
        const baseUrl = new URL(request.url).origin;
        const encoder = new TextEncoder();

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let closed = false;
            const emit = (event: unknown) => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              } catch {
                closed = true;
              }
            };
            try {
              await runExternalBuyer({
                userId,
                message: parsed.data.message,
                scenarioId: parsed.data.scenario_id ?? null,
                baseUrl,
                emit,
                signal: request.signal,
              });
            } catch (error) {
              console.error("[api/agent/external-buyer] run failed", error);
              emit({
                type: "notice",
                code: "agent_error",
                message: "The external buyer run could not be completed.",
              });
              emit({
                type: "done",
                status: "failed",
                step_count: 0,
                tool_call_count: 0,
                duration_ms: 0,
                stop_reason: "agent_error",
                state: null,
              });
            } finally {
              closed = true;
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store, private",
            connection: "keep-alive",
            "x-accel-buffering": "no",
          },
        });
      },
    },
  },
});
