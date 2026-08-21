// Phase 07 — Judge Mode static facts (pure, client-safe, no I/O).
//
// Everything here is documentation *about* the implemented system. It contains no
// secrets and performs no work; the live proof numbers come from judge.functions.ts.

export type ChaosScenarioId =
  | "duplicate_checkout"
  | "duplicate_webhook"
  | "invalid_webhook_signature"
  | "expired_quote"
  | "insufficient_inventory"
  | "policy_violation"
  | "payment_state_guard";

export type ChaosScenarioMeta = {
  id: ChaosScenarioId;
  label: string;
  injects: string;
  expected: string;
  guard: string;
  side_effects: string;
};

export const CHAOS_SCENARIOS: readonly ChaosScenarioMeta[] = [
  {
    id: "duplicate_checkout",
    label: "Duplicate checkout request",
    injects: "The same quote + idempotency key submitted twice, as a retrying agent would.",
    expected: "Exactly one order exists; the second call is an idempotent replay.",
    guard: "Unique (merchant_id, idempotency_key) index + server-side replay detection.",
    side_effects: "Creates one small test order (no payment is taken).",
  },
  {
    id: "duplicate_webhook",
    label: "Duplicate payment webhook",
    injects: "The same signed webhook delivery sent twice with an identical event id.",
    expected: "First delivery processed, second acknowledged as duplicate with no re-processing.",
    guard: "webhook_events unique event id claim before any state mutation.",
    side_effects: "Records two webhook_events rows for a synthetic, unknown Razorpay order.",
  },
  {
    id: "invalid_webhook_signature",
    label: "Forged webhook signature",
    injects: "A valid-looking payment.captured payload with a wrong HMAC signature.",
    expected: "Rejected with 401 before the JSON is even parsed. No payment, no order change.",
    guard: "HMAC-SHA256 over the raw body with RAZORPAY_WEBHOOK_SECRET, constant-time compare.",
    side_effects: "Records one rejected webhook_events row (payload never stored).",
  },
  {
    id: "expired_quote",
    label: "Expired quote checkout",
    injects: "A real server quote, aged past its TTL, then used for checkout.",
    expected: "Checkout refused with quote_expired; no order and no money movement.",
    guard: "Server re-reads quotes.expires_at at checkout time; the client cannot supply prices.",
    side_effects: "None (one expired quote row remains for inspection).",
  },
  {
    id: "insufficient_inventory",
    label: "Inventory overshoot",
    injects: "A quote request for more units than the merchant holds in stock.",
    expected: "Refused with insufficient_inventory at the pricing authority.",
    guard: "Stock check inside the quote endpoint and again at checkout.",
    side_effects: "None.",
  },
  {
    id: "policy_violation",
    label: "Discount policy violation",
    injects: "An aggressive discount demand far above the merchant's policy cap.",
    expected: "Discount deterministically capped at the merchant policy limit.",
    guard: "decideDiscount() runs in server code; the model never computes money.",
    side_effects: "None (one capped quote row).",
  },
  {
    id: "payment_state_guard",
    label: "Illegal state jump",
    injects: "An attempt to treat an unpaid order as completed.",
    expected: "Transition rejected by the checkout state machine and its database trigger.",
    guard: "ALLOWED_TRANSITIONS + enforce_order_transition() trigger in PostgreSQL.",
    side_effects: "None (read-only proof).",
  },
];

export type SecurityControl = {
  control: string;
  where: string;
  proof: string;
};

export const SECURITY_CONTROLS: readonly SecurityControl[] = [
  {
    control: "Row Level Security on every merchant-owned table",
    where: "PostgreSQL policies using owns_merchant() / can_view_order() / has_role()",
    proof: "A merchant can only ever read or write rows for merchants they own.",
  },
  {
    control: "Roles in a separate user_roles table",
    where: "public.user_roles + SECURITY DEFINER has_role()",
    proof: "No role column on profiles, so a profile update cannot escalate privileges.",
  },
  {
    control: "Server-authoritative pricing",
    where: "/api/public/quote + negotiation.server.ts (integer paise math)",
    proof: "No price, total or discount field is accepted from the client or the model.",
  },
  {
    control: "Deterministic policy engine",
    where: "decideDiscount() in negotiation.server.ts",
    proof: "Discounts are capped by merchant_policies, never by an LLM prompt.",
  },
  {
    control: "Zod validation on every tool and server function input",
    where: "agent-tools.server.ts, *.functions.ts, public API routes",
    proof: "Only opaque identifiers and bounded numbers cross the boundary.",
  },
  {
    control: "Human-in-the-loop approval",
    where: "checkout_approvals + reviewApproval() behind merchant ownership check",
    proof: "The agent has no approve capability at all; approval is a merchant-only action.",
  },
  {
    control: "Checkout state machine, mirrored in the database",
    where: "checkout-state.ts + enforce_order_transition() trigger",
    proof: "Illegal transitions fail even if application code is bypassed.",
  },
  {
    control: "Idempotency on checkout and webhooks",
    where: "orders(merchant_id, idempotency_key) unique + webhook_events(event_id) unique",
    proof: "Retries and duplicate deliveries can never double-charge or double-create.",
  },
  {
    control: "HMAC-SHA256 signature verification",
    where: "verifyCheckoutSignature() and verifyWebhookSignature() over the raw body",
    proof: "Forged payment confirmations are rejected before any state change.",
  },
  {
    control: "Amount integrity enforced by the database",
    where: "enforce_payment_amount() trigger",
    proof: "A payment row must match the authoritative order amount, currency and merchant.",
  },
  {
    control: "Secrets stay server-side",
    where: "process.env read inside server handlers only",
    proof: "The browser only ever sees the public Razorpay key_id.",
  },
  {
    control: "Razorpay test mode only",
    where: "razorpay.server.ts mode guard",
    proof: "No live keys, no real money in the demonstration environment.",
  },
];

export const ARCHITECTURE_LAYERS: readonly { layer: string; detail: string }[] = [
  { layer: "AI Buyer agent", detail: "Bounded tool loop — max 10 steps, 20 tool calls, no SQL" },
  { layer: "Tool layer (Zod validated)", detail: "search_catalog · get_product · get_quote · propose_discount · request_checkout" },
  { layer: "Public commerce API", detail: "/api/public/catalog · /search · /products/:id · /quote (pricing authority)" },
  { layer: "Deterministic engines", detail: "Policy engine · checkout state machine · payment state machine" },
  { layer: "PostgreSQL", detail: "RLS · triggers · unique idempotency indexes · audit trail" },
  { layer: "Razorpay (test mode)", detail: "Order creation · signature verification · signed webhooks" },
];

export const MONEY_RULES: readonly string[] = [
  "The model may request a discount. It can never grant one.",
  "Every amount on an order is copied from a persisted quote row, in integer paise.",
  "Approval above the merchant threshold is decided by policy data, not by prompt text.",
  "A payment is only trusted after a server-side signature check and a read-back from Razorpay.",
];
