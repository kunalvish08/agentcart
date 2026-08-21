# Phase 09 — Evaluation Lab

Adds a reproducible A/B evaluation system at `/lab` that measures agentic commerce against a deterministic traditional storefront flow, using the same synthetic scenarios, same catalog and same merchant policy. Phases 01–08 are untouched: no changes to Razorpay, checkout, negotiation, or the external buyer's tool contract.

## 1. Synthetic dataset (v1, 100+ scenarios)

A versioned generator (`src/lib/evaluation-dataset.ts`) produces a deterministic dataset from a fixed seed — same seed, same 100+ scenarios, every run. Categories: product discovery, budget-constrained, exact product, accessory discovery, cross-sell, discount request, invalid product, insufficient inventory, high-value, approval-required, no-match.

Each scenario: `scenario_id`, `intent`, `budget`, `target_category`, `target_product`, `quantity`, `discount_request`, `expected_outcome`, `difficulty`, `category`. Intents are templated with randomized (seeded) phrasing and numbers so no hardcoded response can win. Scenarios are generated across all categories with fixed proportions — no cherry-picking, no filtering of failures.

## 2. Two baselines, same scenarios

**Traditional storefront (deterministic, no LLM).** A modelled shopper flow over the same public API: `search` → rank/select best in-budget match → `quote` → `checkout`. It behaves like a competent shopper: honours budget, picks the best-fitting in-stock product, abandons on no-match or out-of-stock, and takes an accessory only when the storefront would surface one (a real cross-sell surface, not a handicap). It never asks for a discount, because a storefront has no negotiation surface — that is the actual difference being measured, and it is stated in the UI.

**Agentic commerce.** The existing Phase 08 external buyer runner (`runExternalBuyer`) over the public Agent Commerce API with the `X-Agent-Session` token. No new DB access, no new tools, no prompt weakening. Its final `BuyerState` (built only from API responses) is what gets scored.

Both baselines run the *same* scenario rows from the same `evaluation_scenarios` table.

## 3. Batch evaluation engine (chunked, never one big request)

New tables (RLS + merchant scoping): `evaluation_runs`, `evaluation_scenarios`, `evaluation_results`, `evaluation_metrics`.

- Starting a run persists the run header plus all dataset scenarios, status `queued`.
- A public worker route `src/routes/api/public/evaluation-worker.ts` processes one bounded chunk per invocation (default 20 scenarios per baseline pass), with: a single-flight lease row with expiry, per-scenario idempotent progress marking, a per-run item cap, and a circuit breaker that pauses the whole run on AI gateway `402`/`403` and after repeated `429`s. Every entry point checks paused state first.
- The worker is driven by pg_cron (every minute) and additionally kicked by the `/lab` UI while a run is active; both go through the same lease and paused-state guard.
- Traditional results are computed in the same chunk loop (cheap, no model calls), so both arms always cover the identical scenario set.
- Run size is selectable (e.g. 24 / 50 / full dataset) so a real batch can be executed within a demo budget; the dataset always persists 100+ scenarios and the UI always shows the actual completed count, never the dataset size dressed up as a sample.

Each `evaluation_results` row stores: run_id, scenario_id, baseline_type, status, selected_product, gross_amount, discount, final_amount, converted, cross_sell, policy_result, latency_ms, tool_calls, ai_cost, failure_reason, created_at.

## 4. Metrics (all computed from persisted rows)

Revenue: conversion rate, AOV, revenue/session, cross-sell attachment, discount rate, revenue lift vs traditional, AI cost per conversion.
Quality: discovery success, correct product selection, no-match accuracy, hallucinated product count, quote/negotiation/checkout success, approval rate, policy-violation prevention, inventory-rejection accuracy, avg tool calls, avg latency, avg run duration.
Safety: a deterministic safety suite persisted as scenario results in the same run — unauthorized discount blocked, invalid checkout blocked, duplicate checkout prevented, duplicate webhook ignored, invalid webhook signature rejected, expired quote rejected, insufficient inventory rejected, illegal state transition blocked. Each shows pass/total counts from the actual probes; no bare "100%".
Cost/latency: avg and (only with enough samples) p95 model latency, avg tool latency, run duration, tool calls/run, estimated AI cost/run and per conversion — derived from persisted token usage where present, and rendered as **"unavailable"** when tokens or pricing are not known rather than invented.

Every rate is displayed with its numerator/denominator. Below a minimum sample threshold, the panel shows "Early signal — insufficient sample size" instead of a business conclusion. Negative lift is displayed as negative.

## 5. `/lab` UI — premium analytics control room

Top: run selector, dataset version, model + configuration, prompt version, policy and catalog snapshot versions, sample size, status, progress, and a persistent "Evaluation / synthetic data" label.
Middle: Traditional vs Agentic comparison table (sessions, conversions, conversion rate, AOV, revenue, revenue/session, cross-sell, discount rate, AI cost) plus lift rows with counts.
Bottom: Merchant Impact, AI Quality, Safety, "Where the Agent Failed" (scenario, expected, actual, why, safely contained), Latency/Cost. Restrained tables and bars, no growth arrows.
Export Results: CSV and JSON of scenarios + results + metrics, no secrets.

## 6. Reproducibility, Judge Mode, seeding

Each run records dataset version, scenario count, model, model config, prompt version, timestamp, merchant policy snapshot and catalog snapshot (hash + values), so the numbers are explainable.
Judge Mode gets an "Evaluation runs" section with "View evaluation run" linking to `/lab?run=<id>`, and agentic scenario results link to their existing agent run traces.
One seeded evaluation run is inserted by migration, clearly labelled "Seeded evaluation — synthetic data", so `/lab` is never empty; a real batch is then executed and its persisted results become the default selected run.

## 7. Verification

Typecheck, build, security scan, one real batch evaluation executed end-to-end, 100+ scenarios persisted, both arms confirmed on identical scenarios, external buyer confirmed to use only public HTTP, failures visible, AI cost not fabricated, Judge Mode link working, Phases 01–08 and the Razorpay flow re-checked unchanged.
