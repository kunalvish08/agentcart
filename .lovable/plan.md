# Plan - Obsidian Commerce Policies Redesign

Redesign the `/policies` page as a premium enterprise governance console for Agentic Commerce, using the Obsidian Commerce identity.

## User Review Required

> [!IMPORTANT]
> - The "Policy Simulation" section will be implemented as a UI shell this turn as requested, as the full backend evaluation logic for arbitrary inputs isn't exposed via a single server function yet.
> - I will use the existing `updatePolicy` server function for the "Commit Changes" action.

- Does the proposed "Authority Model" visualization match your expectations for the blue-tinted panel?

## Proposed Changes

### Components & UI
#### `src/routes/_authenticated/policies.tsx`
- Implement high-density header with `SERVER-AUTHORITATIVE` and `ENFORCED` status indicators.
- **Section 1: Negotiation & Order Limits**
    - 3-column grid for Max Discount, Max Order, and Approval Threshold.
    - Add relationship visualization: `DISCOUNT CAP → ORDER LIMIT → APPROVAL GATE`.
    - Use monospace for currency and percentage values.
- **Section 2: Agent Capabilities**
    - High-density toggle rows for Negotiation and Upsell permissions.
- **Section 3: Server Authority Panel**
    - Large, prominent panel with blue semantic accent.
    - Technical description of server-authoritative control.
- **Section 4: Policy Simulation**
    - UI shell for evaluating transactions (Product, Value, Discount inputs).
    - Results presentation (`APPROVAL_REQUIRED`, `REQUEST_CHECKOUT`).
- **Section 5: Change Control**
    - Footer-style section with "Last updated" metadata and "Commit Changes" primary action.

### Design System
- Apply `Deep Obsidian` (#0A0D12) and `Graphite` (#121821) theme tokens.
- Use `Blue Authority` accents for governance reinforcement.
- Ensure full responsiveness (1 to 3 columns based on viewport).
- Add Framer Motion reveals for sequential section loading.

## Verification Plan

### Automated Tests
- Run `tsgo` to ensure no type regressions.
- Verify layout responsiveness using Playwright viewport tests if needed.

### Manual Verification
- Confirm "Commit Changes" correctly persists data to the backend via `updatePolicy`.
- Verify light/dark theme compatibility.
- Ensure all visual text matches the "Governance Console" requirements verbatim.
