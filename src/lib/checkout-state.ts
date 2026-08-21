// Phase 05 — deterministic checkout state machine (pure, no I/O).
//
// This module is the single definition of legal checkout states and legal
// transitions. It is mirrored by a database trigger (enforce_order_transition)
// so neither the client, the AI model nor a buggy handler can push an order
// into a state the business rules do not allow.
//
// Phase 05 deliberately ends at PAYMENT_PENDING: there is no COMPLETED state,
// because payment verification belongs to a later phase.

export const CHECKOUT_STATES = [
  "QUOTE_CREATED",
  "CHECKOUT_REQUESTED",
  "APPROVAL_REQUIRED",
  "APPROVED",
  "REJECTED",
  "ORDER_CREATED",
  "PAYMENT_PENDING",
  "CANCELLED",
  "EXPIRED",
] as const;

export type CheckoutState = (typeof CHECKOUT_STATES)[number];

export const ALLOWED_TRANSITIONS: Record<CheckoutState, readonly CheckoutState[]> = {
  QUOTE_CREATED: ["CHECKOUT_REQUESTED", "CANCELLED", "EXPIRED"],
  CHECKOUT_REQUESTED: ["APPROVAL_REQUIRED", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"],
  APPROVAL_REQUIRED: ["APPROVED", "REJECTED", "CANCELLED", "EXPIRED"],
  APPROVED: ["ORDER_CREATED", "CANCELLED", "EXPIRED"],
  ORDER_CREATED: ["PAYMENT_PENDING", "CANCELLED", "EXPIRED"],
  PAYMENT_PENDING: ["CANCELLED", "EXPIRED"],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function isCheckoutState(value: unknown): value is CheckoutState {
  return typeof value === "string" && (CHECKOUT_STATES as readonly string[]).includes(value);
}

/** True only for transitions the business rules permit. Unknown states are rejected. */
export function canTransition(from: unknown, to: unknown): boolean {
  if (!isCheckoutState(from) || !isCheckoutState(to)) return false;
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  code = "invalid_state_transition" as const;
  constructor(
    public readonly from: unknown,
    public readonly to: unknown,
  ) {
    super(`Checkout transition ${String(from)} -> ${String(to)} is not allowed.`);
  }
}

export function assertTransition(from: unknown, to: unknown): CheckoutState {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
  return to as CheckoutState;
}

export const CHECKOUT_STATE_LABELS: Record<CheckoutState, string> = {
  QUOTE_CREATED: "Quote created",
  CHECKOUT_REQUESTED: "Checkout requested",
  APPROVAL_REQUIRED: "Waiting for merchant approval",
  APPROVED: "Approved",
  REJECTED: "Rejected by merchant",
  ORDER_CREATED: "Order created",
  PAYMENT_PENDING: "Checkout ready — payment pending",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

export function isTerminal(state: CheckoutState): boolean {
  return ALLOWED_TRANSITIONS[state].length === 0;
}
