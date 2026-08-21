// Phase 08 — stateless, HMAC-signed agent session tokens.
//
// WHY THIS EXISTS
// The public discovery APIs (manifest/catalog/search/product/quote) are anonymous.
// Negotiation and checkout, however, must be attributable: an order is always tied
// to a real buyer session owned by a real user. The external buyer therefore
// presents an opaque bearer token (minted server-side when a lab run starts) on
// `X-Agent-Session`. The token proves *which buyer session* is speaking; it grants
// no other authority. It cannot approve orders, capture payments or change money.
//
// The token is signed with a server-only secret and carries an expiry. It is never
// logged, never returned to the browser in a public API response, and it is not a
// Supabase credential.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TOKEN_PREFIX = "acs1";
export const AGENT_SESSION_HEADER = "x-agent-session";
export const AGENT_SESSION_TTL_MS = 30 * 60_000;

function signingSecret(): string {
  const secret =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
  if (!secret) throw new Error("Agent session signing secret is not configured.");
  return secret;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(mac);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Mints a short-lived token for an existing buyer session. Server-side only. */
export async function mintAgentSessionToken(sessionId: string, ttlMs = AGENT_SESSION_TTL_MS) {
  const expiresAt = Date.now() + Math.max(60_000, Math.min(ttlMs, AGENT_SESSION_TTL_MS));
  const payload = `${TOKEN_PREFIX}.${sessionId}.${expiresAt}`;
  return { token: `${payload}.${await sign(payload)}`, expiresAt };
}

export type AgentSessionIdentity = {
  session_id: string;
  merchant_id: string;
  user_id: string;
};

export type TokenVerification =
  | { ok: true; identity: AgentSessionIdentity }
  | { ok: false; code: "missing_agent_session" | "invalid_agent_session" | "expired_agent_session" };

/**
 * Verifies the `X-Agent-Session` header: signature, expiry, then the session row.
 * Returns only the identity needed by the server-authoritative logic.
 */
export async function verifyAgentSessionToken(request: Request): Promise<TokenVerification> {
  const raw = request.headers.get(AGENT_SESSION_HEADER)?.trim();
  if (!raw) return { ok: false, code: "missing_agent_session" };
  if (raw.length > 512) return { ok: false, code: "invalid_agent_session" };

  const parts = raw.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_PREFIX) {
    return { ok: false, code: "invalid_agent_session" };
  }
  const [, sessionId, expText, signature] = parts as [string, string, string, string];
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^\d{10,16}$/.test(expText)) {
    return { ok: false, code: "invalid_agent_session" };
  }

  const expected = await sign(`${TOKEN_PREFIX}.${sessionId}.${expText}`);
  if (!timingSafeEqual(signature, expected)) return { ok: false, code: "invalid_agent_session" };
  if (Number(expText) < Date.now()) return { ok: false, code: "expired_agent_session" };

  const { data, error } = await supabaseAdmin
    .from("agent_sessions")
    .select("id, merchant_id, user_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.user_id) return { ok: false, code: "invalid_agent_session" };

  return {
    ok: true,
    identity: { session_id: data.id, merchant_id: data.merchant_id, user_id: data.user_id },
  };
}
