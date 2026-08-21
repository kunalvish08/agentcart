// Phase 08 — typed HTTP client used by the EXTERNAL AI buyer.
//
// CONTRACT
// This module is the external buyer's ONLY way to reach AgentCart. It speaks
// nothing but HTTP against the public Agent Commerce API: no Supabase client, no
// server function, no table access, no secrets. Every call is bounded (timeout),
// validated on the way in, and returns a structured result including status,
// latency and request id so the trace/API-traffic panels show real interactions.
import { z } from "zod";

export const CLIENT_TIMEOUT_MS = 12_000;

export type ApiCall = {
  method: "GET" | "POST";
  path: string;
  status: number;
  ok: boolean;
  latency_ms: number;
  request_id: string | null;
  request_summary: string;
  response_summary: string;
  /** Machine-readable error code returned by the API (null on success). */
  error_code: string | null;
};


export type ApiError = { code: string; message: string; details?: unknown };

export type ApiResult<T> =
  | { ok: true; data: T; call: ApiCall }
  | { ok: false; error: ApiError; call: ApiCall };

function summarize(value: unknown, max = 220): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Response fields that must never be echoed into a trace or the UI. */
const REDACT = /secret|token|signature|authorization|apikey|api_key|password|key_id/i;

function safeSummary(body: unknown): string {
  if (!body || typeof body !== "object") return summarize(body);
  const source = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (REDACT.test(key)) continue;
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) out[key] = value;
    else if (Array.isArray(value)) out[key] = `[${value.length} item(s)]`;
    else out[key] = "{…}";
  }
  return summarize(out);
}

export class AgentCommerceClient {
  private readonly baseUrl: string;
  private readonly merchantSlug: string | undefined;
  private readonly sessionToken: string | undefined;
  readonly calls: ApiCall[] = [];
  private onCall: ((call: ApiCall) => void) | undefined;

  constructor(options: {
    baseUrl: string;
    merchantSlug?: string | undefined;
    /** Opaque buyer-session token. Never logged, never surfaced to the UI. */
    sessionToken?: string | undefined;
    onCall?: (call: ApiCall) => void;
  }) {
    this.baseUrl = options.baseUrl;
    this.merchantSlug = options.merchantSlug;
    this.sessionToken = options.sessionToken;
    this.onCall = options.onCall;
  }

  private async request<T>(args: {
    method: "GET" | "POST";
    path: string;
    tracePath?: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
    authenticated?: boolean;
  }): Promise<ApiResult<T>> {
    const url = new URL(args.path, this.baseUrl);
    for (const [key, value] of Object.entries(args.query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    const tracePath = args.tracePath ?? `${url.pathname}${url.search}`;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    const record = (call: ApiCall) => {
      this.calls.push(call);
      this.onCall?.(call);
      return call;
    };

    try {
      const response = await fetch(url, {
        method: args.method,
        headers: {
          accept: "application/json",
          ...(args.body ? { "content-type": "application/json" } : {}),
          ...(args.authenticated && this.sessionToken
            ? { "x-agent-session": this.sessionToken }
            : {}),
        },
        ...(args.body ? { body: JSON.stringify(args.body) } : {}),
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text || "null");
      } catch {
        parsed = null;
      }

      const raw = (parsed as { error?: ApiError } | null)?.error;
      const call = record({
        method: args.method,
        path: tracePath,
        status: response.status,
        ok: response.ok,
        latency_ms: Date.now() - started,
        request_id: response.headers.get("x-request-id"),
        request_summary: args.body ? safeSummary(args.body) : summarize(url.search || "no query"),
        response_summary: safeSummary(parsed),
        error_code: response.ok ? null : String(raw?.code ?? `http_${response.status}`),
      });

      if (!response.ok) {
        return {
          ok: false,
          error: {
            code: String(raw?.code ?? `http_${response.status}`),
            message: String(raw?.message ?? "The Agent Commerce API rejected this request."),
            ...(raw?.details ? { details: raw.details } : {}),
          },
          call,
        };
      }
      return { ok: true, data: parsed as T, call };

    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      const call = record({
        method: args.method,
        path: tracePath,
        status: 0,
        ok: false,
        latency_ms: Date.now() - started,
        request_id: null,
        request_summary: args.body ? safeSummary(args.body) : summarize(url.search || "no query"),
        response_summary: aborted ? "timeout" : "network error",
        error_code: aborted ? "timeout" : "network_error",
      });

      return {
        ok: false,
        error: {
          code: aborted ? "timeout" : "network_error",
          message: aborted
            ? `The merchant API did not respond within ${CLIENT_TIMEOUT_MS / 1000}s.`
            : "The merchant API could not be reached.",
        },
        call,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /* -------------------------------- contracts ------------------------------- */

  discoverMerchant() {
    return this.request<Record<string, any>>({
      method: "GET",
      path: "/.well-known/agent-manifest",
      query: { merchant: this.merchantSlug },
    });
  }

  browseCatalog(input: { limit?: number }) {
    const args = z.object({ limit: z.number().int().min(1).max(50).default(10) }).parse(input);
    return this.request<Record<string, any>>({
      method: "GET",
      path: "/api/public/catalog",
      query: { merchant: this.merchantSlug, limit: args.limit },
    });
  }

  searchProducts(input: { query: string; max_price?: number; category?: string; limit?: number }) {
    const args = z
      .object({
        query: z.string().trim().min(1).max(200),
        max_price: z.number().positive().max(100_000_000).optional(),
        category: z.string().trim().max(80).optional(),
        limit: z.number().int().min(1).max(10).default(5),
      })
      .parse(input);
    return this.request<Record<string, any>>({
      method: "GET",
      path: "/api/public/search",
      query: {
        merchant: this.merchantSlug,
        q: args.query,
        limit: args.limit,
        ...(args.max_price !== undefined ? { max_price: args.max_price } : {}),
        ...(args.category ? { category: args.category } : {}),
      },
    });
  }

  getProduct(input: { product_id: string }) {
    const args = z.object({ product_id: z.string().uuid() }).parse(input);
    return this.request<Record<string, any>>({
      method: "GET",
      path: `/api/public/products/${args.product_id}`,
      tracePath: "/api/public/products/:id",
      query: { merchant: this.merchantSlug },
    });
  }

  getQuote(input: { product_id: string; quantity: number; requested_discount_percent?: number }) {
    const args = z
      .object({
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(100),
        requested_discount_percent: z.number().min(0).max(100).default(0),
      })
      .parse(input);
    return this.request<Record<string, any>>({
      method: "POST",
      path: "/api/public/quote",
      body: { ...args, merchant: this.merchantSlug },
    });
  }

  negotiate(input: {
    product_id: string;
    quantity: number;
    requested_discount_percent: number;
    buyer_note?: string;
  }) {
    const args = z
      .object({
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(100),
        requested_discount_percent: z.number().min(0).max(100),
        buyer_note: z.string().trim().max(400).optional(),
      })
      .parse(input);
    return this.request<Record<string, any>>({
      method: "POST",
      path: "/api/public/negotiate",
      body: { ...args, merchant: this.merchantSlug },
      authenticated: true,
    });
  }

  requestCheckout(input: { quote_id: string; idempotency_key: string; buyer_note?: string }) {
    const args = z
      .object({
        quote_id: z.string().uuid(),
        idempotency_key: z
          .string()
          .trim()
          .min(8)
          .max(128)
          .regex(/^[A-Za-z0-9_-]+$/),
        buyer_note: z.string().trim().max(400).optional(),
      })
      .parse(input);
    return this.request<Record<string, any>>({
      method: "POST",
      path: "/api/public/checkout",
      body: args,
      authenticated: true,
    });
  }

  observeOrder(input: { order_id: string }) {
    const args = z.object({ order_id: z.string().uuid() }).parse(input);
    return this.request<Record<string, any>>({
      method: "GET",
      path: `/api/public/orders/${args.order_id}`,
      tracePath: "/api/public/orders/:id",
      authenticated: true,
    });
  }
}
