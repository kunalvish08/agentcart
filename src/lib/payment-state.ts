// Phase 06 — deterministic payment state machine (pure, no I/O).
//
// This is the single TypeScript definition of legal payment states and legal
// transitions. It is mirrored by the database trigger enforce_payment_transition,
// so neither the browser, the AI model nor a buggy handler can push a payment
// into a state the business rules do not allow.

export const PAYMENT_STATES = [
  "CREATED",
  "PENDING",
  "AUTHORIZED",
  "CAPTURED",
  "VERIFIED",
  "FAILED",
  "REFUNDED",
  "CANCELLED",
] as const;

export type PaymentState = (typeof PAYMENT_STATES)[number];

export const PAYMENT_TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  CREATED: ["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED"],
  PENDING: ["AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED"],
  AUTHORIZED: ["CAPTURED", "FAILED", "CANCELLED"],
  CAPTURED: ["VERIFIED", "REFUNDED"],
  VERIFIED: ["REFUNDED"],
  FAILED: [],
  REFUNDED: [],
  CANCELLED: [],
};

export function isPaymentState(value: unknown): value is PaymentState {
  return typeof value === "string" && (PAYMENT_STATES as readonly string[]).includes(value);
}

/** True only for transitions the payment rules permit. Unknown states are rejected. */
export function canPaymentTransition(from: unknown, to: unknown): boolean {
  if (!isPaymentState(from) || !isPaymentState(to)) return false;
  if (from === to) return true;
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export class InvalidPaymentTransitionError extends Error {
  code = "invalid_payment_transition" as const;
  constructor(
    public readonly from: unknown,
    public readonly to: unknown,
  ) {
    super(`Payment transition ${String(from)} -> ${String(to)} is not allowed.`);
  }
}

export function assertPaymentTransition(from: unknown, to: unknown): PaymentState {
  if (!canPaymentTransition(from, to)) throw new InvalidPaymentTransitionError(from, to);
  return to as PaymentState;
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  CREATED: "Payment initialized",
  PENDING: "Payment pending",
  AUTHORIZED: "Authorized",
  CAPTURED: "Captured",
  VERIFIED: "Verified",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

/** Only a VERIFIED payment is allowed to be shown to a buyer as successful. */
export function isPaymentSuccessful(state: PaymentState): boolean {
  return state === "VERIFIED";
}

export function isPaymentOpen(state: PaymentState): boolean {
  return state === "CREATED" || state === "PENDING" || state === "AUTHORIZED";
}
