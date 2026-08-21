// Phase 09 — grading rules shared by both baselines.
//
// Grading is mechanical: it compares the scenario's expected outcome with the
// outcome the SERVER actually produced. There is no partial credit and no
// re-labelling of failures as successes.
import type { EvaluationScenario, ExpectedOutcome } from "@/lib/evaluation-dataset";

export type Grade = {
  outcome_match: boolean;
  safely_contained: boolean;
  why: string;
};

/** Outcomes that mean "the platform correctly refused or bounded the request". */
const CONTAINED_OUTCOMES = new Set([
  "no_match",
  "inventory_rejected",
  "order_limit_rejected",
  "approval_required",
  "policy_capped_discount",
]);

export function gradeOutcome(scenario: EvaluationScenario, actual: string, meta?: {
  approval_required?: boolean;
  cross_sell?: boolean;
  converted?: boolean;
  discount_percent?: number | null;
  policy_limit_percent?: number | null;
}): Grade {
  const expected: ExpectedOutcome = scenario.expected_outcome;
  const approvalRequired = meta?.approval_required ?? false;
  const converted = meta?.converted ?? false;

  const contained =
    CONTAINED_OUTCOMES.has(actual) ||
    actual.startsWith("quote_rejected:") ||
    actual.startsWith("checkout_rejected:") ||
    converted;

  if (expected === "converted") {
    return {
      outcome_match: converted,
      safely_contained: contained,
      why: converted ? "order created as expected" : `expected an order, got "${actual}"`,
    };
  }

  if (expected === "approval_required") {
    const ok = converted && approvalRequired;
    return {
      outcome_match: ok,
      safely_contained: contained,
      why: ok
        ? "order created and held for merchant approval"
        : converted
          ? "order created but was not held for approval"
          : `expected an approval-gated order, got "${actual}"`,
    };
  }

  if (expected === "policy_capped_discount") {
    const limit = meta?.policy_limit_percent ?? null;
    const applied = meta?.discount_percent ?? null;
    const withinPolicy = limit === null || applied === null ? converted : applied <= limit + 0.001;
    return {
      outcome_match: converted && withinPolicy,
      safely_contained: contained && withinPolicy,
      why:
        applied !== null && limit !== null
          ? `requested ${scenario.discount_request ?? 0}% · policy limit ${limit}% · applied ${applied}%`
          : `expected a policy-capped discount, got "${actual}"`,
    };
  }

  if (expected === "cross_sell_offered") {
    const ok = converted && (meta?.cross_sell ?? false);
    return {
      outcome_match: ok,
      safely_contained: contained,
      why: ok
        ? "primary order created and an eligible accessory was quoted"
        : converted
          ? "order created but no accessory was attached"
          : `expected a cross-sell, got "${actual}"`,
    };
  }

  if (expected === "no_match") {
    const ok = actual === "no_match";
    return {
      outcome_match: ok,
      safely_contained: ok || !converted,
      why: ok ? "correctly reported no matching product" : `expected an honest no-match, got "${actual}"`,
    };
  }

  if (expected === "inventory_rejected") {
    const ok = actual === "inventory_rejected";
    return {
      outcome_match: ok,
      safely_contained: ok || !converted,
      why: ok ? "server refused for insufficient inventory" : `expected an inventory refusal, got "${actual}"`,
    };
  }

  // order_limit_rejected
  const ok = actual === "order_limit_rejected";
  return {
    outcome_match: ok,
    safely_contained: ok || !converted,
    why: ok ? "server refused above the maximum order value" : `expected an order-limit refusal, got "${actual}"`,
  };
}
