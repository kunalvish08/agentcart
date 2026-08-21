// Phase 06 — Razorpay TEST MODE client and signature verification.
//
// SECURITY CONTRACT
// - RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are read from process.env
//   inside functions only (Cloudflare Workers inject env per request) and never
//   returned, logged, or serialized. Only the publishable key id may leave the server.
// - The Razorpay Node SDK is not used: it is not Workers-compatible. We call the
//   REST API over fetch and compute HMAC-SHA256 with Web Crypto.
// - Test mode only: a key id that is not rzp_test_* is refused.

const RAZORPAY_API = "https://api.razorpay.com/v1";

export type RazorpayConfig = { keyId: string; keySecret: string };

export class RazorpayNotConfiguredError extends Error {
  code = "razorpay_not_configured" as const;
  constructor(message = "Razorpay test credentials are not configured on the server yet.") {
    super(message);
  }
}

export class RazorpayModeError extends Error {
  code = "razorpay_live_key_refused" as const;
  constructor() {
    super("Only Razorpay TEST MODE keys (rzp_test_*) are accepted by this platform.");
  }
}

/** Reads credentials at call time. Throws typed errors the callers convert to safe responses. */
export function getRazorpayConfig(): RazorpayConfig {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) throw new RazorpayNotConfiguredError();
  if (!keyId.startsWith("rzp_test_")) throw new RazorpayModeError();
  return { keyId, keySecret };
}

export function isRazorpayConfigured(): boolean {
  try {
    getRazorpayConfig();
    return true;
  } catch {
    return false;
  }
}

export function getWebhookSecret(): string {
  const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
  if (!secret) {
    throw new RazorpayNotConfiguredError("The Razorpay webhook secret is not configured yet.");
  }
  return secret;
}

/* ------------------------------ signatures ------------------------------ */

const encoder = new TextEncoder();

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(message));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Length-independent, constant-time-ish comparison. Never short-circuits on content. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Razorpay Checkout handler signature: HMAC(order_id|payment_id, key_secret). */
export async function verifyCheckoutSignature(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): Promise<boolean> {
  const { keySecret } = getRazorpayConfig();
  const expected = await hmacSha256Hex(
    keySecret,
    `${args.razorpayOrderId}|${args.razorpayPaymentId}`,
  );
  return timingSafeEqualHex(expected, args.signature.trim().toLowerCase());
}

/** Webhook signature: HMAC(rawBody, webhook_secret). The RAW body is mandatory. */
export async function verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean> {
  const expected = await hmacSha256Hex(getWebhookSecret(), rawBody);
  return timingSafeEqualHex(expected, (signature ?? "").trim().toLowerCase());
}

/* ------------------------------ REST client ------------------------------ */

function authHeader({ keyId, keySecret }: RazorpayConfig): string {
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

export class RazorpayApiError extends Error {
  code = "razorpay_api_error" as const;
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function razorpayFetch<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
): Promise<T> {
  const config = getRazorpayConfig();
  const response = await fetch(`${RAZORPAY_API}${path}`, {
    method: init.method,
    headers: {
      authorization: authHeader(config),
      "content-type": "application/json",
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });

  const text = await response.text();
  if (!response.ok) {
    let description = `Razorpay request failed (${response.status}).`;
    try {
      const parsed = JSON.parse(text) as { error?: { description?: string } };
      if (parsed.error?.description) description = parsed.error.description;
    } catch {
      /* keep the generic message — never echo an unparsed provider body */
    }
    // Never log credentials: only path, status and provider description.
    console.error("[razorpay] request failed", { path, status: response.status });
    throw new RazorpayApiError(description, response.status);
  }
  return JSON.parse(text) as T;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  amount_paid: number;
  currency: string;
  status: string;
  receipt?: string | null;
};

export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  captured?: boolean;
  error_description?: string | null;
  error_reason?: string | null;
};

/** Creates a Razorpay test-mode order. `amountMinor` is authoritative paise. */
export function createRazorpayOrder(args: {
  amountMinor: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  return razorpayFetch<RazorpayOrder>("/orders", {
    method: "POST",
    body: {
      amount: args.amountMinor,
      currency: args.currency,
      receipt: args.receipt.slice(0, 40),
      payment_capture: 1,
      notes: args.notes ?? {},
    },
  });
}

export function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  return razorpayFetch<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export function fetchRazorpayOrderPayments(
  razorpayOrderId: string,
): Promise<{ items: RazorpayPayment[] }> {
  return razorpayFetch<{ items: RazorpayPayment[] }>(
    `/orders/${encodeURIComponent(razorpayOrderId)}/payments`,
  );
}

export function fetchRazorpayOrder(razorpayOrderId: string): Promise<RazorpayOrder> {
  return razorpayFetch<RazorpayOrder>(`/orders/${encodeURIComponent(razorpayOrderId)}`);
}

/** Maps a Razorpay payment status onto our internal state machine vocabulary. */
export function mapRazorpayPaymentStatus(
  status: string,
): "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED" {
  switch (status) {
    case "captured":
      return "CAPTURED";
    case "authorized":
      return "AUTHORIZED";
    case "failed":
      return "FAILED";
    default:
      return "PENDING";
  }
}
