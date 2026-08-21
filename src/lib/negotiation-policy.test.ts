import { describe, expect, it } from "vitest";

import { decideDiscount } from "./negotiation.server";

const open = { allow_negotiation: true, max_discount_percent: 12 };

describe("deterministic discount policy engine", () => {
  it("accepts a request within the merchant limit", () => {
    const d = decideDiscount({ requestedPercent: 5, policy: open });
    expect(d.decision).toBe("accept");
    expect(d.approved_discount_percent).toBe(5);
  });

  it("accepts exactly at the limit", () => {
    const d = decideDiscount({ requestedPercent: 12, policy: open });
    expect(d.decision).toBe("accept");
    expect(d.approved_discount_percent).toBe(12);
  });

  it("counters above the limit and never exceeds it", () => {
    for (const requested of [12.5, 20, 50, 100]) {
      const d = decideDiscount({ requestedPercent: requested, policy: open });
      expect(d.decision).toBe("counter");
      expect(d.approved_discount_percent).toBe(12);
      expect(d.approved_discount_percent).toBeLessThanOrEqual(open.max_discount_percent);
    }
  });

  it("approves zero discount when negotiation is disabled", () => {
    const closed = { allow_negotiation: false, max_discount_percent: 12 };
    const d = decideDiscount({ requestedPercent: 10, policy: closed });
    expect(d.approved_discount_percent).toBe(0);
    expect(d.policy_limit_percent).toBe(0);
    expect(d.decision).toBe("reject");
  });

  it("rejects out-of-range percentages", () => {
    for (const requested of [-1, 101, Number.NaN]) {
      const d = decideDiscount({ requestedPercent: requested, policy: open });
      expect(d.approved_discount_percent).toBe(0);
    }
  });
});
