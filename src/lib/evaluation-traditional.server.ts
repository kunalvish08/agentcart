// Phase 09 — deterministic TRADITIONAL STOREFRONT baseline.
//
// This is the control arm of the A/B evaluation. It models a competent human
// shopper on a normal storefront and uses exactly the same public API, the same
// catalog and the same merchant policy as the agentic arm:
//
//   search / browse -> product selection -> cart (quote) -> checkout
//
// It is deliberately NOT handicapped: it honours the budget, prefers an exact
// named product, otherwise picks the best-fitting in-stock in-budget item, and
// attaches an accessory from the product page's related-items strip whenever the
// shopper's intent asks for accessories.
//
// The one thing it cannot do is negotiate — a storefront has no negotiation
// surface. That absence is the effect the experiment measures; it is not a
// deliberate weakening, and the Lab states it explicitly.
import { AgentCommerceClient, type ApiCall } from "@/lib/agent-commerce-client.server";
import type { EvaluationScenario } from "@/lib/evaluation-dataset";

const ACCESSORY_WORDS = /accessor|add-?on|recommend|goes with|go with|desk/i;

export type BaselineAttempt = {
  converted: boolean;
  selected_product: string | null;
  selected_product_id: string | null;
  gross_amount: number | null;
  discount: number | null;
  final_amount: number | null;
  currency: string | null;
  quote_issued: boolean;
  negotiated: boolean;
  approval_required: boolean;
  cross_sell: boolean;
  cross_sell_amount: number | null;
  policy_result: string | null;
  actual_outcome: string;
  failure_reason: string | null;
  hallucinated_product: boolean;
  api_calls: ApiCall[];
  order_id: string | null;
  latency_ms: number;
  tool_calls: number;
  detail: Record<string, unknown>;
};

type Candidate = {
  product_id: string;
  name: string;
  price: number;
  in_stock: boolean;
  category: string | null;
};

/** Strips the money/quantity noise so the storefront search box gets real words. */
function searchQuery(scenario: EvaluationScenario): string {
  if (scenario.target_product) return scenario.target_product;
  if (scenario.target_category === "Accessories") return "laptop accessory";
  const words = scenario.intent
    .replace(/₹[\d,]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/[^a-zA-Z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .filter(
      (w) =>
        !/^(need|looking|find|want|help|pick|shopping|trying|please|recommend|under|with|that|them|just|unit|units|company|above|limit|anyway|sign|team|purchase|what|your|does)$/i.test(
          w,
        ),
    );
  return words.slice(0, 6).join(" ") || scenario.intent.slice(0, 60);
}

function rows(data: unknown): Candidate[] {
  const source = (data ?? {}) as Record<string, any>;
  const list = (source["results"] ?? source["products"] ?? []) as Array<Record<string, any>>;
  return list
    .filter((r) => r && r["product_id"])
    .map((r) => ({
      product_id: String(r["product_id"]),
      name: String(r["name"] ?? ""),
      price: Number(r["price"] ?? 0),
      in_stock: Boolean(r["in_stock"]),
      category: r["category"] ? String(r["category"]) : null,
    }));
}

/**
 * A real shopper only buys something that is actually the kind of thing they came
 * for. Without this gate the storefront arm "converted" by buying a ₹1,499 laptop
 * stand when the shopper wanted a laptop under ₹21,000 — a false conversion that
 * flattered the control arm. Relevance is derived from the scenario's declared
 * target category (the same field the agentic arm sees), never from a product id.
 */
function isRelevant(scenario: EvaluationScenario, candidate: Candidate): boolean {
  if (!scenario.target_category) return true;
  if (candidate.category) return candidate.category === scenario.target_category;
  return true;
}

function selectProduct(scenario: EvaluationScenario, candidates: Candidate[]): Candidate | null {
  const available = candidates.filter((c) => c.in_stock && c.price > 0 && isRelevant(scenario, c));
  if (available.length === 0) return null;

  const named = scenario.target_product
    ? available.find((c) => c.name.toLowerCase() === scenario.target_product!.toLowerCase())
    : undefined;
  const budget = scenario.budget;

  if (named) {
    if (budget !== null && named.price * scenario.quantity > budget) return null;
    return named;
  }

  const inBudget =
    budget === null ? available : available.filter((c) => c.price * scenario.quantity <= budget);
  if (inBudget.length === 0) return null;

  // A shopper hunting a cheap accessory takes the cheapest usable item; anyone
  // else takes the top-ranked search result (the storefront's own relevance).
  if (scenario.target_category === "Accessories" || /cheap|inexpensive|low-?cost/i.test(scenario.intent)) {
    return [...inBudget].sort((a, b) => a.price - b.price)[0] ?? null;
  }
  return inBudget[0] ?? null;
}


function errorOf(result: { ok: false; error: { code: string; message: string } }) {
  return { code: result.error.code, message: result.error.message };
}

export async function runTraditionalBaseline(args: {
  scenario: EvaluationScenario;
  client: AgentCommerceClient;
  idempotencyKey: string;
}): Promise<BaselineAttempt> {
  const { scenario, client, idempotencyKey } = args;
  const startedAt = Date.now();
  let calls = 0;

  const base: BaselineAttempt = {
    converted: false,
    selected_product: null,
    selected_product_id: null,
    gross_amount: null,
    discount: null,
    final_amount: null,
    currency: null,
    quote_issued: false,
    negotiated: false,
    approval_required: false,
    cross_sell: false,
    cross_sell_amount: null,
    policy_result: null,
    actual_outcome: "abandoned",
    failure_reason: null,
    hallucinated_product: false,
    api_calls: [],
    order_id: null,
    latency_ms: 0,
    tool_calls: 0,
    detail: {},
  };

  const finish = (patch: Partial<BaselineAttempt>): BaselineAttempt => ({
    ...base,
    ...patch,
    api_calls: client.calls,
    tool_calls: calls,
    latency_ms: Date.now() - startedAt,
  });

  // 1. search / browse
  calls += 1;
  const search = await client.searchProducts({
    query: searchQuery(scenario),
    ...(scenario.budget !== null ? { max_price: scenario.budget } : {}),
    limit: 5,
  });
  if (!search.ok) {
    return finish({
      actual_outcome: "api_error",
      failure_reason: `search failed: ${errorOf(search).code}`,
    });
  }

  const candidates = rows(search.data);
  const selected = selectProduct(scenario, candidates);
  if (!selected) {
    return finish({
      actual_outcome: "no_match",
      failure_reason:
        candidates.length === 0
          ? "storefront search returned no products for this intent"
          : "no in-stock product fitted the shopper's budget",
      detail: { candidates: candidates.length },
    });
  }

  // 2. product page
  calls += 1;
  const detail = await client.getProduct({ product_id: selected.product_id });
  if (!detail.ok) {
    return finish({
      selected_product: selected.name,
      selected_product_id: selected.product_id,
      actual_outcome: "api_error",
      failure_reason: `product page failed: ${errorOf(detail).code}`,
    });
  }
  const related = (((detail.data as Record<string, any>)["related_products"] ?? []) as Array<
    Record<string, any>
  >)
    .filter((r) => Boolean(r["in_stock"]))
    .map((r) => ({ product_id: String(r["product_id"]), name: String(r["name"]), price: Number(r["price"]) }));

  // 3. cart -> authoritative quote (no discount: a storefront has no negotiation)
  calls += 1;
  const quote = await client.getQuote({ product_id: selected.product_id, quantity: scenario.quantity });
  if (!quote.ok) {
    const err = errorOf(quote);
    const outcome =
      err.code === "insufficient_inventory"
        ? "inventory_rejected"
        : err.code === "order_value_exceeded"
          ? "order_limit_rejected"
          : `quote_rejected:${err.code}`;
    return finish({
      selected_product: selected.name,
      selected_product_id: selected.product_id,
      policy_result: err.code,
      actual_outcome: outcome,
      failure_reason: err.message,
    });
  }

  const q = quote.data as Record<string, any>;
  const grossAmount = Number(q["base_amount"] ?? selected.price * scenario.quantity);
  const finalAmount = Number(q["final_amount"] ?? grossAmount);

  // 3b. related-items strip: attach an accessory when the shopper asked for one.
  let crossSell = false;
  let crossSellAmount: number | null = null;
  const wantsAccessory =
    ACCESSORY_WORDS.test(scenario.intent) || scenario.category === "cross_sell";
  const attachable = related
    .filter((r) => r.product_id !== selected.product_id)
    .sort((a, b) => a.price - b.price)[0];
  if (wantsAccessory && attachable) {
    calls += 1;
    const attachQuote = await client.getQuote({ product_id: attachable.product_id, quantity: 1 });
    if (attachQuote.ok) {
      crossSell = true;
      crossSellAmount = Number((attachQuote.data as Record<string, any>)["final_amount"] ?? attachable.price);
    }
  }

  // 4. checkout
  calls += 1;
  const checkout = await client.requestCheckout({
    quote_id: String(q["quote_id"]),
    idempotency_key: idempotencyKey,
    buyer_note: `Traditional storefront checkout · ${scenario.scenario_id}`,
  });

  if (!checkout.ok) {
    const err = errorOf(checkout);
    return finish({
      selected_product: selected.name,
      selected_product_id: selected.product_id,
      gross_amount: grossAmount,
      discount: Number(q["discount_amount"] ?? 0),
      final_amount: finalAmount,
      currency: String(q["currency"] ?? "INR"),
      quote_issued: true,
      cross_sell: crossSell,
      cross_sell_amount: crossSellAmount,
      policy_result: err.code,
      actual_outcome:
        err.code === "insufficient_inventory"
          ? "inventory_rejected"
          : err.code === "order_value_exceeded"
            ? "order_limit_rejected"
            : `checkout_rejected:${err.code}`,
      failure_reason: err.message,
    });
  }

  const order = ((checkout.data as Record<string, any>)["order"] ?? {}) as Record<string, any>;
  const approvalRequired = Boolean(order["approval_required"]) || order["status"] === "APPROVAL_REQUIRED";

  return finish({
    converted: true,
    selected_product: selected.name,
    selected_product_id: selected.product_id,
    gross_amount: Number(order["subtotal_amount"] ?? grossAmount),
    discount: Number(order["discount_amount"] ?? 0),
    final_amount: Number(order["final_amount"] ?? finalAmount),
    currency: String(order["currency"] ?? "INR"),
    quote_issued: true,
    approval_required: approvalRequired,
    cross_sell: crossSell,
    cross_sell_amount: crossSellAmount,
    policy_result: approvalRequired ? "approval_required" : "accepted",
    order_id: order["order_id"] ? String(order["order_id"]) : null,
    actual_outcome: approvalRequired ? "approval_required" : "converted",
    detail: { candidates: candidates.length, related: related.length },
  });
}
