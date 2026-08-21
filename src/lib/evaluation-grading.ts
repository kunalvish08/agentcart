// Phase 09 — grading rules shared by both arms.
//
// Grading is mechanical and auditable. It never re-labels a failure as a success.
// Two things changed after the Phase 09 harness audit:
//
//   1. Actual outcomes are NORMALISED before comparison, because the same server
//      refusal can surface at two different steps (quote or checkout) and with
//      two different transport shapes. `quote_rejected:insufficient_inventory`
//      and `inventory_rejected` are literally the same server decision.
//   2. Cross-reason equivalence is allowed ONLY when the request genuinely
//      breached both limits, so the server was free to refuse on either ground.
//      Fundamentally different business outcomes are never treated as equal.
import type { EvaluationScenario, ExpectedOutcome } from "@/lib/evaluation-dataset";

export type Grade = {
  outcome_match: boolean;
  safely_contained: boolean;
  why: string;
};

/**
 * Extra facts the caller knows about the request that was actually sent.
 * `breached_inventory` / `breached_order_value` are computed from the run's
 * catalog + policy snapshot, never from the arm's own report.
 */
export type GradeMeta = {
  approval_required?: boolean;
  cross_sell?: boolean;
  converted?: boolean;
  discount_percent?: number | null;
  policy_limit_percent?: number | null;
  breached_inventory?: boolean;
  breached_order_value?: boolean;
};

/** Canonical outcome vocabulary used for comparison. */
export type CanonicalOutcome =
  | "converted"
  | "approval_required"
  | "no_match"
  | "inventory_rejected"
  | "order_limit_rejected"
  | "policy_capped_discount"
  | "other_safe_rejection"
  | "abandoned"
  | "harness_error"
  | "unknown";

/**
 * Server error codes → canonical outcome. Documented equivalence rule #1:
 * an identical server decision reported at a different step is the same outcome.
 */
const CODE_TO_CANONICAL: Record<string, CanonicalOutcome> = {
  insufficient_inventory: "inventory_rejected",
  inventory_rejected: "inventory_rejected",
  order_value_exceeded: "order_limit_rejected",
  order_limit_rejected: "order_limit_rejected",
  product_not_found: "no_match",
  product_inactive: "no_match",
};

export function normalizeOutcome(actual: string): CanonicalOutcome {
  if (actual === "converted") return "converted";
  if (actual === "approval_required") return "approval_required";
  if (actual === "no_match") return "no_match";
  if (actual === "policy_capped_discount") return "policy_capped_discount";
  if (actual === "harness_error" || actual === "api_error") return "harness_error";
  if (actual === "abandoned" || actual === "abandoned_after_quote") return "abandoned";
  if (actual in CODE_TO_CANONICAL) return CODE_TO_CANONICAL[actual] as CanonicalOutcome;

  const [, code] = actual.split(":");
  if (actual.startsWith("quote_rejected:") || actual.startsWith("checkout_rejected:")) {
    return (CODE_TO_CANONICAL[code ?? ""] as CanonicalOutcome | undefined) ?? "other_safe_rejection";
  }
  return "unknown";
}

/** Canonical outcomes that mean "the platform refused or bounded the request". */
const SAFE_REJECTIONS = new Set<CanonicalOutcome>([
  "no_match",
  "inventory_rejected",
  "order_limit_rejected",
  "other_safe_rejection",
  "policy_capped_discount",
]);

/**
 * Documented equivalence rule #2 (cross-reason). A refusal on a DIFFERENT limit
 * than the one the scenario targets counts as a match only when the request
 * actually breached that other limit too — e.g. "buy 60 laptops" breaches both
 * stock (25 units) and the ₹100,000 order ceiling, so either refusal is correct.
 */
function crossReasonAllowed(
  expected: CanonicalOutcome,
  actual: CanonicalOutcome,
  meta: GradeMeta,
): boolean {
  if (expected === "inventory_rejected" && actual === "order_limit_rejected") {
    return meta.breached_order_value === true && meta.breached_inventory === true;
  }
  if (expected === "order_limit_rejected" && actual === "inventory_rejected") {
    return meta.breached_inventory === true && meta.breached_order_value === true;
  }
  return false;
}

export function gradeOutcome(
  scenario: EvaluationScenario,
  actual: string,
  meta?: GradeMeta,
): Grade {
  const expected: ExpectedOutcome = scenario.expected_outcome;
  const approvalRequired = meta?.approval_required ?? false;
  const converted = meta?.converted ?? false;
  const canonical = normalizeOutcome(actual);
  const contained = converted || SAFE_REJECTIONS.has(canonical);

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

  // Refusal-shaped expectations: no_match / inventory_rejected / order_limit_rejected.
  const expectedCanonical = normalizeOutcome(expected);
  const exact = canonical === expectedCanonical;
  const equivalent = !exact && crossReasonAllowed(expectedCanonical, canonical, meta ?? {});
  const ok = exact || equivalent;

  return {
    outcome_match: ok,
    safely_contained: ok || (!converted && SAFE_REJECTIONS.has(canonical)),
    why: exact
      ? `server refused as expected (${canonical})`
      : equivalent
        ? `refused on an equally valid ground: expected ${expectedCanonical}, server refused with ${canonical} (both limits were breached)`
        : `expected ${expectedCanonical}, got "${actual}"`,
  };
}
