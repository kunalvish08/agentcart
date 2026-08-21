import { describe, expect, it } from "vitest";

import {
  ALLOWED_TRANSITIONS,
  assertTransition,
  canTransition,
  CHECKOUT_STATES,
  IDEMPOTENCY_KEY_RE,
  isTerminal,
} from "@/lib/checkout-state";

describe("checkout state machine", () => {
  it("allows the happy path only in order", () => {
    expect(canTransition("CHECKOUT_REQUESTED", "APPROVAL_REQUIRED")).toBe(true);
    expect(canTransition("APPROVAL_REQUIRED", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "ORDER_CREATED")).toBe(true);
    expect(canTransition("ORDER_CREATED", "PAYMENT_PENDING")).toBe(true);
  });

  it("rejects skipping approval or order creation", () => {
    expect(canTransition("CHECKOUT_REQUESTED", "PAYMENT_PENDING")).toBe(false);
    expect(canTransition("APPROVAL_REQUIRED", "ORDER_CREATED")).toBe(false);
    expect(canTransition("APPROVED", "PAYMENT_PENDING")).toBe(false);
  });

  it("only reaches COMPLETED through a captured payment (Phase 06)", () => {
    expect(CHECKOUT_STATES).toContain("COMPLETED" as never);
    expect(canTransition("PAYMENT_PENDING", "COMPLETED")).toBe(false);
    expect(() => assertTransition("PAYMENT_PENDING", "COMPLETED")).toThrow(/not allowed/);
    expect(canTransition("PAYMENT_PENDING", "PAYMENT_CAPTURED")).toBe(true);
    expect(canTransition("PAYMENT_CAPTURED", "COMPLETED")).toBe(true);
  });


  it("treats rejection, cancellation and expiry as terminal", () => {
    for (const state of ["REJECTED", "CANCELLED", "EXPIRED"] as const) {
      expect(isTerminal(state)).toBe(true);
      expect(canTransition(state, "APPROVED")).toBe(false);
      expect(canTransition(state, "PAYMENT_PENDING")).toBe(false);
    }
  });

  it("never allows a rejected order to be revived or an order to un-approve", () => {
    expect(canTransition("REJECTED", "CHECKOUT_REQUESTED")).toBe(false);
    expect(canTransition("APPROVED", "APPROVAL_REQUIRED")).toBe(false);
    expect(canTransition("PAYMENT_PENDING", "ORDER_CREATED")).toBe(false);
  });

  it("rejects unknown or malformed states", () => {
    expect(canTransition("PAID", "PAYMENT_PENDING")).toBe(false);
    expect(canTransition("CHECKOUT_REQUESTED", "paid")).toBe(false);
    expect(canTransition(null, undefined)).toBe(false);
  });

  it("keeps every declared transition inside the known state set", () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(CHECKOUT_STATES).toContain(from as never);
      for (const target of targets) expect(CHECKOUT_STATES).toContain(target);
    }
  });
});

describe("idempotency keys", () => {
  it("accepts safe keys and rejects unsafe ones", () => {
    expect(IDEMPOTENCY_KEY_RE.test("abc12345")).toBe(true);
    expect(IDEMPOTENCY_KEY_RE.test("co-1234567890-abcdef")).toBe(true);
    expect(IDEMPOTENCY_KEY_RE.test("abc123")).toBe(false); // too short
    expect(IDEMPOTENCY_KEY_RE.test("abc 12345")).toBe(false); // whitespace
    expect(IDEMPOTENCY_KEY_RE.test("'; drop table orders;--")).toBe(false);
    expect(IDEMPOTENCY_KEY_RE.test("a".repeat(129))).toBe(false);
  });
});
