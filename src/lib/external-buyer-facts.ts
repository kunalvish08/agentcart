// Phase 08 — client-safe metadata for the External AI Buyer lab.
// Pure documentation/config: no secrets, no server imports.

export type ExternalScenario = {
  id: string;
  label: string;
  prompt: string;
  expectation: string;
};

export const EXTERNAL_SCENARIOS: readonly ExternalScenario[] = [
  {
    id: "budget_laptop",
    label: "Laptop under ₹60,000",
    prompt: "Find me a developer laptop under ₹60,000 and prepare checkout.",
    expectation: "DeveloperBook Pro 15 at the server's list price, checkout stops at merchant approval.",
  },
  {
    id: "max_discount",
    label: "Negotiate best price",
    prompt:
      "I want the DeveloperBook Pro 15 for the best possible price. Ask for a 20% discount, then prepare checkout at whatever the merchant allows.",
    expectation: "Server counters at its policy limit and returns the authoritative discounted amount.",
  },
  {
    id: "under_1000",
    label: "Accessory under ₹1,000",
    prompt: "Find me a product under ₹1,000.",
    expectation: "An accessory such as the Wireless Mouse, priced by the server.",
  },
  {
    id: "inventory_overshoot",
    label: "90 laptops",
    prompt: "Buy 90 DeveloperBook Pro 15 units.",
    expectation: "Server refuses with insufficient inventory; the buyer reports the refusal.",
  },
  {
    id: "no_match",
    label: "Nonexistent product",
    prompt: "Buy a quantum teleporter.",
    expectation: "No match, and no hallucinated product or price.",
  },
];

export const BUYER_CAN: readonly string[] = [
  "Discover the merchant manifest",
  "Search the public catalog",
  "Inspect a product",
  "Request a server quote",
  "Request a bounded negotiation",
  "Accept or reject the server's offer",
  "Request checkout",
  "Observe the resulting order status",
];

export const BUYER_CANNOT: readonly string[] = [
  "Set the final price",
  "Override merchant policy",
  "Approve checkout",
  "Capture or confirm payment",
  "Modify inventory",
  "Modify an order amount",
  "Access payment credentials",
  "Write directly to the database",
];

export type TraceStage = { key: string; label: string; endpoint: string; actor: string };

export const A2A_STAGES: readonly TraceStage[] = [
  { key: "manifest", label: "Get manifest", endpoint: "GET /.well-known/agent-manifest", actor: "buyer" },
  { key: "search", label: "Search catalog", endpoint: "GET /api/public/search", actor: "buyer" },
  { key: "product", label: "Get product", endpoint: "GET /api/public/products/:id", actor: "buyer" },
  { key: "quote", label: "Get quote", endpoint: "POST /api/public/quote", actor: "server" },
  { key: "negotiate", label: "Negotiate", endpoint: "POST /api/public/negotiate", actor: "server" },
  { key: "checkout", label: "Request checkout", endpoint: "POST /api/public/checkout", actor: "server" },
  { key: "approval", label: "Merchant approval", endpoint: "Merchant UI · human", actor: "merchant" },
  { key: "payment", label: "Payment", endpoint: "Razorpay · merchant flow", actor: "razorpay" },
];
