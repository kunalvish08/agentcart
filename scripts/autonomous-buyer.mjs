#!/usr/bin/env node
/**
 * Standalone autonomous buyer — no chat UI, no human input mid-run.
 *
 * Consumes ONLY the existing public Agent Commerce API. All monetary values,
 * policy caps and approval decisions are derived from live server responses.
 *
 * Usage:
 *   BASE_URL=https://agentcart.lovable.app \
 *   BUYER_EMAIL=demo@technova.test BUYER_PASSWORD='TechNova@2026' \
 *   node scripts/autonomous-buyer.mjs
 */
const BASE = (process.env.BASE_URL || "https://agentcart.lovable.app").replace(/\/$/, "");
const SUPABASE_URL = process.env.SUPABASE_URL || "https://myruziolnxgoqamymfwr.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_8MoyqQo8E5xQeOKV81OhTw_mVpv_iTO";
const EMAIL = process.env.BUYER_EMAIL || "demo@technova.test";
const PASSWORD = process.env.BUYER_PASSWORD || "TechNova@2026";

const GOAL = {
  budget: 60000,
  need: "coding laptop",
  wants_accessory: true,
  max_acceptable_discount_ask: 30,
};

let CALLS = 0;
const money = (n, c = "INR") => `${c === "INR" ? "₹" : c + " "}${Number(n).toLocaleString("en-IN")}`;
const log = (s) => console.log(s);

async function api(path, { method = "GET", headers = {}, body } = {}) {
  CALLS += 1;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw Object.assign(new Error(json?.error?.message || res.statusText), { status: res.status, code: json?.error?.code, body: json });
  return json;
}

async function signIn() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: SUPABASE_KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`Sign-in failed: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

const started = Date.now();
try {
  log(`🤖 Autonomous buyer started · goal: "${GOAL.need}" · budget ${money(GOAL.budget)}`);
  log("Signing in as demo buyer…");
  const jwt = await signIn();
  const tok = await api("/api/agent/lab-token", { method: "POST", headers: { authorization: `Bearer ${jwt}` } });
  const AGENT = { "x-agent-session": tok.agent_session_token };
  log(`Buyer session ready · merchant ${tok.merchant_slug} · currency ${tok.currency}`);

  log("Searching catalog…");
  const search = await api(`/api/public/search?q=${encodeURIComponent(GOAL.need)}&max_price=${GOAL.budget}&in_stock=true&limit=10`);
  // Prefer the highest-priced primary product within budget (real laptops over accessories).
  const pick = (search.results || []).slice().sort((a, b) => Number(b.price) - Number(a.price))[0];
  if (!pick) { log("No product matched the goal within budget. Stopping."); process.exit(0); }
  log(`Picked: ${pick.name} · list ${money(pick.price, pick.currency)} · stock ${pick.stock_status}`);

  let addOn = null;
  if (GOAL.wants_accessory) {
    const product = await api(`/api/public/products/${pick.product_id}`);
    const rel = product?.related_products || [];
    addOn = rel.find((r) => r.relation_type !== "alternative" && r.availability === "available") || null;
    if (addOn) log(`Eligible add-on: ${addOn.name} (${addOn.relation_type}) · ${money(addOn.price, addOn.currency)}`);
    else log("No eligible add-ons offered by merchant policy.");
  }

  log(`Requesting quote at list price for ${pick.name}…`);
  const baseQuote = await api("/api/public/quote", { method: "POST", body: { product_id: pick.product_id, quantity: 1 } });
  log(`Quote: ${money(baseQuote.final_amount, baseQuote.currency)} · approval required: ${baseQuote.requires_merchant_approval}`);

  log(`Proposing ${GOAL.max_acceptable_discount_ask}% discount…`);
  let quoteForCheckout = baseQuote;
  try {
    const neg = await api("/api/public/negotiate", {
      method: "POST",
      headers: AGENT,
      body: { product_id: pick.product_id, quantity: 1, requested_discount_percent: GOAL.max_acceptable_discount_ask },
    });
    log(`Server responded: ${neg.decision} · policy cap ${neg.policy_limit_percent}% · offered ${neg.approved_discount_percent}%`);
    log(`Reason: ${neg.policy_reason}`);
    if (neg.decision !== "reject" && neg.offer_id && neg.approved_discount_percent > 0) {
      log(`Accepting counter-offer at ${neg.approved_discount_percent}%…`);
      const acc = await api(`/api/public/offers/${neg.offer_id}/accept`, { method: "POST", headers: AGENT, body: { action: "accept" } });
      quoteForCheckout = acc.quote || quoteForCheckout;
      log(`Fresh accepted quote: ${money(quoteForCheckout.final_amount, quoteForCheckout.currency)}`);
    } else {
      log("No discount available; proceeding at list price.");
    }
  } catch (e) {
    log(`Negotiation blocked (${e.code || e.status}): ${e.message}`);
  }

  const idem = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  log(`Requesting checkout (idempotency ${idem})…`);
  try {
    const co = await api("/api/public/checkout", {
      method: "POST",
      headers: AGENT,
      body: { quote_id: quoteForCheckout.quote_id, idempotency_key: idem, buyer_note: addOn ? `Add-on interest: ${addOn.name}` : undefined },
    });
    const order = co.order || co;
    const orderId = order.order_id || order.id;
    log(`Order created: ${orderId} · status ${order.status} · total ${money(order.final_amount, order.currency)}`);

    let final = order;
    if (order.approval_required && order.approval_status !== "approved") {
      log("⏸  Waiting for merchant approval — script will not fake-approve.");
      for (let i = 0; i < 6; i += 1) {
        await new Promise((r) => setTimeout(r, 5000));
        const snap = await api(`/api/public/orders/${orderId}`, { headers: AGENT });
        final = snap.order;
        log(`  poll ${i + 1}: status=${final.status} approval=${final.approval_status}`);
        if (final.approval_status && final.approval_status !== "pending") break;
      }
    }
    log("──────── RESULT ────────");
    log(`Order       : ${orderId}`);
    log(`Status      : ${final.status} · approval ${final.approval_status ?? "n/a"} · payment ${final.payment_state ?? "n/a"}`);
    log(`Final amount: ${money(final.final_amount, final.currency)}`);
  } catch (e) {
    log(`Checkout rejected (${e.code || e.status}): ${e.message}`);
  }
} catch (e) {
  log(`❌ Fatal: ${e.message}`);
  process.exitCode = 1;
} finally {
  log(`API calls: ${CALLS} · Elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
}
