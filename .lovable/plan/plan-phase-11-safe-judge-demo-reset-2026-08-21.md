# Plan: Phase 11 — Safe Judge Demo Reset

Implement a surgical, server-side reset for the TechNova demo store to ensure a clean end-to-end judge demonstration without impacting evaluation data or production configuration.

## Proposed Reset Scope

I will implement a "Safe Reset" that identifies demo records using specific markers created during the `runJudgeDemo` flow.

### Identification Markers
- **Sessions**: `agent_sessions.title` = "Judge Mode · deterministic demo run"
- **Runs**: `agent_runs.model` = "deterministic/judge-demo"
- **Orders**: `orders.customer_request_summary` contains "Judge Mode deterministic demo checkout"
- **Audit**: `checkout_audit_events.reason` contains "Judge Mode"

### Tables to be Scoped for Deletion (TechNova Merchant only)
1.  **Agent Logic**: `agent_sessions`, `agent_runs`, `agent_steps`, `tool_calls`
2.  **Commerce Logic**: `negotiation_sessions`, `negotiation_rounds`, `offers`, `quotes` (demo only)
3.  **Order Logic**: `orders`, `order_items`, `checkout_approvals`, `checkout_audit_events`
4.  **Payment Logic**: `payments`, `webhook_events`

### Preservation (No-Touch Zone)
-   `merchants`, `products`, `merchant_policies`
-   `evaluation_runs`, `evaluation_results`, `evaluation_metrics`, `evaluation_scenarios`
-   Razorpay credentials and production env vars

## Technical Tasks

### 1. Server-Side Logic
-   Create `resetJudgeDemo` in `src/lib/judge.server.ts`.
-   Use a single database transaction to delete demo-marked records for the owner's merchant.
-   Return a report of counts removed per category.

### 2. API & Frontend
-   Add `resetJudgeDemo` server function in `src/lib/judge.functions.ts`.
-   Update `src/routes/_authenticated/judge.tsx`:
    -   Add "Reset Judge Demo" button with an `AlertDialog` confirmation.
    -   Display the reset summary (timestamp, counts, and preservation confirmation).

### 3. Verification & Testing
-   Create `src/scripts/test-demo-reset.ts` to verify the scope:
    -   Assert demo records are gone.
    -   Assert evaluation records and products remain.
    -   Assert RLS prevents unauthorized reset.
-   Run typecheck and build.

## Safety & Security
-   The reset will be gated by `requireSupabaseAuth` and `owns_merchant` check.
-   Deletion will be strictly limited to the `merchant_id` of the authenticated user.
-   Explicit markers will be used instead of timestamps to prevent accidental deletion of recent real orders.
