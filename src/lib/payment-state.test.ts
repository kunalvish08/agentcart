import { describe, expect, it } from "vitest";

import { ALLOWED_TRANSITIONS, canTransition } from "@/lib/checkout-state";
import {
  canPaymentTransition,
  assertPaymentTransition,
  isPaymentSuccessful,
  PAYMENT_STATES,
} from "@/lib/payment-state";

describe("payment state machine", () => {
  it("follows the successful path", () => {
    expect(canPaymentTransition("CREATED", "PENDING")).toBe(true);
    expect(canPaymentTransition("PENDING", "AUTHORIZED")).toBe(true);
    expect(canPaymentTransition("AUTHORIZED", "CAPTURED")).toBe(true);
    expect(canPaymentTransition("CAPTURED", "VERIFIED")).toBe(true);
  });

  it("allows failure only from open states", () => {
    expect(canPaymentTransition("PENDING", "FAILED")).toBe(true);
    expect(canPaymentTransition("CAPTURED", "FAILED")).toBe(false);
    expect(canPaymentTransition("VERIFIED", "FAILED")).toBe(false);
  });

  it("rejects backwards and invalid transitions", () => {
    expect(canPaymentTransition("VERIFIED", "PENDING")).toBe(false);
    expect(canPaymentTransition("VERIFIED", "CAPTURED")).toBe(false);
    expect(canPaymentTransition("CAPTURED", "CREATED")).toBe(false);
    expect(canPaymentTransition("FAILED", "CAPTURED")).toBe(false);
    expect(canPaymentTransition("CAPTURED", "CAPTURED")).toBe(true);
    expect(() => assertPaymentTransition("VERIFIED", "PENDING")).toThrow(
      /not allowed/,
    );
  });

  it("rejects unknown states", () => {
    expect(canPaymentTransition("PAID", "VERIFIED")).toBe(false);
    expect(canPaymentTransition("CAPTURED", "SUCCESS")).toBe(false);
    expect(canPaymentTransition(undefined, null)).toBe(false);
  });

  it("treats only VERIFIED as successful", () => {
    for (const state of PAYMENT_STATES) {
      expect(isPaymentSuccessful(state)).toBe(state === "VERIFIED");
    }
  });
});

describe("order state machine payment path", () => {
  it("only completes through a captured payment", () => {
    expect(canTransition("PAYMENT_PENDING", "PAYMENT_CAPTURED")).toBe(true);
    expect(canTransition("PAYMENT_CAPTURED", "COMPLETED")).toBe(true);
    expect(canTransition("PAYMENT_PENDING", "COMPLETED")).toBe(false);
    expect(canTransition("ORDER_CREATED", "COMPLETED")).toBe(false);
  });

  it("keeps COMPLETED terminal", () => {
    expect(ALLOWED_TRANSITIONS.COMPLETED).toHaveLength(0);
    expect(canTransition("COMPLETED", "PAYMENT_PENDING")).toBe(false);
    expect(canTransition("COMPLETED", "PAYMENT_CAPTURED")).toBe(false);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
  });
});
