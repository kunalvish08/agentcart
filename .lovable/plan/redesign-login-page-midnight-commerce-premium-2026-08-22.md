# Redesign Login Page: Midnight Commerce Premium

Redesign the login page into a high-end "commerce infrastructure control plane" using a split-screen layout, technical architecture visuals, and the Midnight Commerce identity.

## Changes

### `src/routes/login.tsx`
- Implement a split-screen layout (Dark technical visual on left, clean auth panel on right).
- **Left Column**:
    - Build a compact technical flow: CATALOG → POLICY → AI BUYER → SERVER AUTHORITY → CHECKOUT.
    - Highlight **SERVER AUTHORITY** as the core node.
    - Add technical labels (PRICE, INVENTORY, POLICY, PAYMENT).
    - Sequential reveal animations for nodes and connectors using Framer Motion.
    - Subtle pulse on SERVER AUTHORITY.
- **Right Column**:
    - Merchant Console branding.
    - Refined Auth form (Email, Password, Sign in, Create account).
    - Subtle technical callout for demo merchant credentials.
    - Trust labels at bottom (DATABASE ENFORCED, SERVER AUTHORITY, MERCHANT SCOPED).
- **Responsivity**:
    - Desktop: Split-screen.
    - Tablet: Two-column where possible.
    - Mobile: Stacked, architecture visual above form.
- **Preservation**:
    - Maintain existing Supabase auth logic, validation, and session handling.
    - No instruction text injected into UI.

## Technical Details
- **Colors**: Use the established Midnight Commerce palette (#0B1220, #111B2E, #3157FF, #36C5D8, etc.) via semantic variables.
- **Animations**: Framer Motion (150-700ms).
- **Components**: Reuse shadcn components (`Button`, `Input`, `Label`).
