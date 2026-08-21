// Phase 09 — reproducible synthetic evaluation dataset.
//
// Deterministic: the same (version, seed) always produces exactly the same
// scenario list, in the same order, with the same phrasing and numbers. Nothing
// here is cherry-picked — the generator emits fixed proportions across every
// category, including the categories the platform is expected to REFUSE.
//
// This module is browser-safe (pure data, no secrets, no DB) so the UI can
// describe the dataset without a server round-trip.

export const DATASET_VERSION = "technova-eval-v1";
export const DATASET_SEED = "agentcart-phase09-seed-1";
export const PROMPT_VERSION = "external-buyer-prompt-v1";
export const DATASET_TARGET_SIZE = 110;

export type ScenarioCategory =
  | "product_discovery"
  | "budget_constrained"
  | "exact_product"
  | "accessory_discovery"
  | "cross_sell"
  | "discount_request"
  | "invalid_product"
  | "insufficient_inventory"
  | "high_value"
  | "approval_required"
  | "no_match";

export type ExpectedOutcome =
  | "converted"
  | "approval_required"
  | "policy_capped_discount"
  | "cross_sell_offered"
  | "no_match"
  | "inventory_rejected"
  | "order_limit_rejected";

export type Difficulty = "easy" | "medium" | "hard";

export type EvaluationScenario = {
  scenario_id: string;
  sequence: number;
  category: ScenarioCategory;
  intent: string;
  budget: number | null;
  target_category: string | null;
  target_product: string | null;
  quantity: number;
  discount_request: number | null;
  expected_outcome: ExpectedOutcome;
  difficulty: Difficulty;
};

export const CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  product_discovery: "Product discovery",
  budget_constrained: "Budget constrained",
  exact_product: "Exact product request",
  accessory_discovery: "Accessory discovery",
  cross_sell: "Cross-sell opportunity",
  discount_request: "Discount request",
  invalid_product: "Invalid product",
  insufficient_inventory: "Insufficient inventory",
  high_value: "High-value order",
  approval_required: "Approval required",
  no_match: "No-match query",
};

export const OUTCOME_LABELS: Record<ExpectedOutcome, string> = {
  converted: "Order created",
  approval_required: "Merchant approval required",
  policy_capped_discount: "Discount capped by policy",
  cross_sell_offered: "Cross-sell surfaced",
  no_match: "Honest no-match",
  inventory_rejected: "Rejected: insufficient inventory",
  order_limit_rejected: "Rejected: order value limit",
};

/* ------------------------------ seeded random ----------------------------- */

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

function pick<T>(rng: Rng, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)] as T;
}

function pickInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/* ------------------------------ vocabularies ------------------------------ */

const OPENERS = [
  "I need",
  "Looking for",
  "Can you find me",
  "I want to buy",
  "Help me pick",
  "Shopping for",
  "Trying to get",
] as const;

const LAPTOP_TERMS = [
  "a developer laptop",
  "a laptop for coding",
  "a dev machine for docker and node",
  "a programming laptop",
  "a laptop I can compile on all day",
] as const;

const ACCESSORY_TERMS = [
  "a cheap accessory for my laptop",
  "an inexpensive laptop add-on",
  "the cheapest useful laptop accessory",
  "a low-cost desk accessory",
] as const;

const ACCESSORY_NAMES = ["Wireless Mouse", "USB-C Hub", "Laptop Stand", "Mechanical Keyboard"] as const;

const NONEXISTENT = [
  "a quantum teleporter",
  "a graphene smartwatch",
  "a 5G refrigerator",
  "an antigravity chair",
  "a plasma television with holographic mode",
  "a self-driving skateboard",
  "a titanium espresso drone",
] as const;

const OFF_CATALOG = [
  "a wedding dress",
  "organic almond butter",
  "a mountain bike helmet",
  "a acoustic guitar",
  "concert tickets for Saturday",
] as const;

const LAPTOP = "DeveloperBook Pro 15";

/* ------------------------------- generators ------------------------------- */

type Recipe = {
  category: ScenarioCategory;
  count: number;
  build: (rng: Rng) => Omit<EvaluationScenario, "scenario_id" | "sequence" | "category">;
};

const RECIPES: Recipe[] = [
  {
    category: "product_discovery",
    count: 14,
    build: (rng) => ({
      intent: `${pick(rng, OPENERS)} ${pick(rng, LAPTOP_TERMS)}. What do you recommend?`,
      budget: null,
      target_category: "Laptops",
      target_product: LAPTOP,
      quantity: 1,
      discount_request: null,
      expected_outcome: "approval_required",
      difficulty: "easy",
    }),
  },
  {
    category: "budget_constrained",
    count: 16,
    build: (rng) => {
      const feasible = rng() < 0.6;
      const budget = feasible ? pickInt(rng, 56, 75) * 1000 : pickInt(rng, 20, 48) * 1000;
      return {
        intent: `${pick(rng, OPENERS)} ${pick(rng, LAPTOP_TERMS)} under ₹${budget.toLocaleString("en-IN")}.`,
        budget,
        target_category: "Laptops",
        target_product: feasible ? LAPTOP : null,
        quantity: 1,
        discount_request: null,
        expected_outcome: feasible ? "approval_required" : "no_match",
        difficulty: feasible ? "easy" : "hard",
      };
    },
  },
  {
    category: "exact_product",
    count: 12,
    build: (rng) => {
      const accessory = pick(rng, ACCESSORY_NAMES);
      const wantsLaptop = rng() < 0.4;
      return {
        intent: wantsLaptop
          ? `${pick(rng, OPENERS)} the ${LAPTOP}. Please quote one unit.`
          : `${pick(rng, OPENERS)} the ${accessory}. Just that, one unit.`,
        budget: null,
        target_category: wantsLaptop ? "Laptops" : "Accessories",
        target_product: wantsLaptop ? LAPTOP : accessory,
        quantity: 1,
        discount_request: null,
        expected_outcome: wantsLaptop ? "approval_required" : "converted",
        difficulty: "easy",
      };
    },
  },
  {
    category: "accessory_discovery",
    count: 12,
    build: (rng) => {
      const budget = pickInt(rng, 1, 3) * 1000;
      return {
        intent: `${pick(rng, OPENERS)} ${pick(rng, ACCESSORY_TERMS)} under ₹${budget.toLocaleString("en-IN")}.`,
        budget,
        target_category: "Accessories",
        target_product: null,
        quantity: 1,
        discount_request: null,
        expected_outcome: "converted" as const,
        difficulty: "medium" as const,
      };
    },
  },

  {
    category: "cross_sell",
    count: 12,
    build: (rng) => ({
      intent: `${pick(rng, OPENERS)} 1 ${LAPTOP} and recommend accessories that go with it.`,
      budget: null,
      target_category: "Laptops",
      target_product: LAPTOP,
      quantity: 1,
      discount_request: null,
      expected_outcome: "cross_sell_offered",
      difficulty: "medium",
    }),
  },
  {
    category: "discount_request",
    count: 16,
    build: (rng) => {
      const percent = pickInt(rng, 15, 45);
      const accessory = pick(rng, ACCESSORY_NAMES);
      const onLaptop = rng() < 0.5;
      return {
        intent: onLaptop
          ? `I want the ${LAPTOP} with a ${percent}% discount.`
          : `Give me the ${accessory} but I need ${percent}% off.`,
        budget: null,
        target_category: onLaptop ? "Laptops" : "Accessories",
        target_product: onLaptop ? LAPTOP : accessory,
        quantity: 1,
        discount_request: percent,
        expected_outcome: "policy_capped_discount",
        difficulty: "hard",
      };
    },
  },
  {
    category: "invalid_product",
    count: 8,
    build: (rng) => ({
      intent: `${pick(rng, OPENERS)} ${pick(rng, NONEXISTENT)}.`,
      budget: null,
      target_category: null,
      target_product: null,
      quantity: 1,
      discount_request: null,
      expected_outcome: "no_match",
      difficulty: "medium",
    }),
  },
  {
    category: "insufficient_inventory",
    count: 8,
    build: (rng) => {
      const qty = pickInt(rng, 40, 95);
      return {
        intent: `Buy ${qty} ${LAPTOP} units for my team.`,
        budget: null,
        target_category: "Laptops",
        target_product: LAPTOP,
        quantity: qty,
        discount_request: null,
        expected_outcome: "inventory_rejected",
        difficulty: "hard",
      };
    },
  },
  {
    category: "high_value",
    count: 6,
    build: (rng) => {
      const qty = pickInt(rng, 2, 4);
      return {
        intent: `Order ${qty} ${LAPTOP} units in one purchase.`,
        budget: null,
        target_category: "Laptops",
        target_product: LAPTOP,
        quantity: qty,
        discount_request: null,
        expected_outcome: "order_limit_rejected",
        difficulty: "hard",
      };
    },
  },
  {
    category: "approval_required",
    count: 8,
    build: (rng) => ({
      intent: `${pick(rng, OPENERS)} one ${LAPTOP} — it is above my company's ₹50,000 sign-off limit, proceed anyway.`,
      budget: null,
      target_category: "Laptops",
      target_product: LAPTOP,
      quantity: 1,
      discount_request: rng() < 0.4 ? pickInt(rng, 5, 10) : null,
      expected_outcome: "approval_required",
      difficulty: "medium",
    }),
  },
  {
    category: "no_match",
    count: 8,
    build: (rng) => ({
      intent: `${pick(rng, OPENERS)} ${pick(rng, OFF_CATALOG)}.`,
      budget: null,
      target_category: null,
      target_product: null,
      quantity: 1,
      discount_request: null,
      expected_outcome: "no_match",
      difficulty: "easy",
    }),
  },
];

/**
 * Builds the full dataset. Interleaved by category so that any prefix (the
 * sampled subset a batch actually runs) still covers every category — the sample
 * is a slice of the order below, never a hand-picked set of winners.
 */
export function buildDataset(seed: string = DATASET_SEED): EvaluationScenario[] {
  const rng = mulberry32(hashSeed(`${DATASET_VERSION}:${seed}`));
  const perCategory = new Map<ScenarioCategory, EvaluationScenario[]>();

  for (const recipe of RECIPES) {
    const bucket: EvaluationScenario[] = [];
    for (let i = 0; i < recipe.count; i += 1) {
      const body = recipe.build(rng);
      bucket.push({
        scenario_id: `${recipe.category}-${String(i + 1).padStart(3, "0")}`,
        sequence: 0,
        category: recipe.category,
        ...body,
      });
    }
    perCategory.set(recipe.category, bucket);
  }

  const interleaved: EvaluationScenario[] = [];
  const maxCount = Math.max(...RECIPES.map((r) => r.count));
  for (let index = 0; index < maxCount; index += 1) {
    for (const recipe of RECIPES) {
      const scenario = perCategory.get(recipe.category)?.[index];
      if (scenario) interleaved.push(scenario);
    }
  }

  return interleaved.map((scenario, i) => ({ ...scenario, sequence: i + 1 }));
}

export function datasetCategoryCounts(scenarios: EvaluationScenario[]) {
  const counts = new Map<ScenarioCategory, number>();
  for (const s of scenarios) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  return [...counts.entries()].map(([category, count]) => ({ category, count }));
}
