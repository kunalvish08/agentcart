// Phase 03 — authenticated streaming endpoint for the AI Buyer.
// Not under /api/public: every request must carry a valid Supabase bearer token.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(1000),
  session_id: z.string().uuid().nullish(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .optional(),
});

function sseError(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/agent/buyer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return sseError(401, "unauthorized", "Authentication required.");
        }
        const token = authHeader.slice(7).trim();
        if (token.split(".").length !== 3) {
          return sseError(401, "unauthorized", "Invalid session token.");
        }

        const text = await request.text();
        if (text.length > 20_000) {
          return sseError(413, "payload_too_large", "Request body too large.");
        }
        let raw: unknown;
        try {
          raw = JSON.parse(text || "{}");
        } catch {
          return sseError(400, "invalid_json", "Request body must be JSON.");
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return sseError(400, "invalid_request", "Invalid AI Buyer request.");
        }

        const { createClient } = await import("@supabase/supabase-js");
        const supabaseUrl = process.env["SUPABASE_URL"];
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !publishableKey) {
          return sseError(500, "not_configured", "Backend is not configured.");
        }
        const authClient = createClient(supabaseUrl, publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
        const userId = claimsData?.claims?.sub;
        if (claimsError || !userId) {
          return sseError(401, "unauthorized", "Invalid session token.");
        }

        const { rateLimit } = await import("@/lib/public-api.server");
        if (!rateLimit(request, "agent-buyer", 20)) {
          return sseError(429, "rate_limited", "Too many AI Buyer requests. Try again shortly.");
        }

        const { runAgent } = await import("@/lib/agent-runner.server");
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
              await runAgent({
                userId,
                sessionId: parsed.data.session_id ?? null,
                message: parsed.data.message,
                history: parsed.data.history ?? [],
                baseUrl,
                emit,
                signal: request.signal,
              });
            } catch (error) {
              console.error("[api/agent/buyer] run failed", error);
              emit({
                type: "notice",
                code: "agent_error",
                message: "The AI Buyer could not complete this request.",
              });
              emit({ type: "done", status: "failed", step_count: 0, tool_call_count: 0, duration_ms: 0 });
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
