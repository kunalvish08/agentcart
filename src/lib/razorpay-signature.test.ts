import { beforeEach, describe, expect, it } from "vitest";

import {
  getRazorpayConfig,
  hmacSha256Hex,
  isRazorpayConfigured,
  RazorpayModeError,
  timingSafeEqualHex,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "@/lib/razorpay.server";

const KEY_ID = "rzp_test_unit";
const KEY_SECRET = "unit-test-key-secret";
const WEBHOOK_SECRET = "unit-test-webhook-secret";

beforeEach(() => {
  process.env["RAZORPAY_KEY_ID"] = KEY_ID;
  process.env["RAZORPAY_KEY_SECRET"] = KEY_SECRET;
  process.env["RAZORPAY_WEBHOOK_SECRET"] = WEBHOOK_SECRET;
});

describe("razorpay configuration", () => {
  it("refuses live keys — test mode only", () => {
    process.env["RAZORPAY_KEY_ID"] = "rzp_live_something";
    expect(() => getRazorpayConfig()).toThrow(RazorpayModeError);
    expect(isRazorpayConfigured()).toBe(false);
  });

  it("reports missing credentials instead of throwing to the caller", () => {
    delete process.env["RAZORPAY_KEY_SECRET"];
    expect(isRazorpayConfigured()).toBe(false);
  });
});

describe("checkout handler signature", () => {
  it("accepts a correctly signed payment", async () => {
    const razorpayOrderId = "order_ABC123";
    const razorpayPaymentId = "pay_XYZ789";
    const signature = await hmacSha256Hex(
      KEY_SECRET,
      `${razorpayOrderId}|${razorpayPaymentId}`,
    );
    await expect(
      verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, signature }),
    ).resolves.toBe(true);
  });

  it("rejects a tampered payment id, order id or signature", async () => {
    const signature = await hmacSha256Hex(KEY_SECRET, "order_ABC123|pay_XYZ789");
    await expect(
      verifyCheckoutSignature({
        razorpayOrderId: "order_ABC123",
        razorpayPaymentId: "pay_TAMPERED",
        signature,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyCheckoutSignature({
        razorpayOrderId: "order_OTHER",
        razorpayPaymentId: "pay_XYZ789",
        signature,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyCheckoutSignature({
        razorpayOrderId: "order_ABC123",
        razorpayPaymentId: "pay_XYZ789",
        signature: "0".repeat(64),
      }),
    ).resolves.toBe(false);
  });

  it("is computed with the secret, not derivable from the public key id", async () => {
    const withSecret = await hmacSha256Hex(KEY_SECRET, "order_A|pay_B");
    const withKeyId = await hmacSha256Hex(KEY_ID, "order_A|pay_B");
    expect(withSecret).not.toEqual(withKeyId);
  });
});

describe("webhook signature (raw body)", () => {
  const rawBody = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_1", amount: 5_500_000, status: "captured" } } },
  });

  it("accepts the raw body it was signed over", async () => {
    const signature = await hmacSha256Hex(WEBHOOK_SECRET, rawBody);
    await expect(verifyWebhookSignature(rawBody, signature)).resolves.toBe(true);
  });

  it("rejects a re-serialized (parsed then stringified) body", async () => {
    const signature = await hmacSha256Hex(WEBHOOK_SECRET, rawBody);
    const reserialized = JSON.stringify({ ...JSON.parse(rawBody), extra: 1 });
    await expect(verifyWebhookSignature(reserialized, signature)).resolves.toBe(false);
  });

  it("rejects a signature made with the API secret instead of the webhook secret", async () => {
    const wrong = await hmacSha256Hex(KEY_SECRET, rawBody);
    await expect(verifyWebhookSignature(rawBody, wrong)).resolves.toBe(false);
  });

  it("rejects empty and malformed signatures", async () => {
    await expect(verifyWebhookSignature(rawBody, "")).resolves.toBe(false);
    await expect(verifyWebhookSignature(rawBody, "not-a-signature")).resolves.toBe(false);
  });
});

describe("timing safe comparison", () => {
  it("compares content, not length shortcuts", () => {
    expect(timingSafeEqualHex("abcd", "abcd")).toBe(true);
    expect(timingSafeEqualHex("abcd", "abce")).toBe(false);
    expect(timingSafeEqualHex("abcd", "abcdef")).toBe(false);
    expect(timingSafeEqualHex("", "")).toBe(true);
  });
});
