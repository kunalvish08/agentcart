# Fix Agent Capabilities Policy Persistence

Fix the persistence issue where "Allow negotiation" and "Allow upsell" settings reset to ON after navigation. Ensure server-side enforcement and deterministic behavior.

## User Review Required

> [!NOTE]
> The current frontend state was likely losing synchronization with the database because the `useEffect` was only populating the form when it was `null`. If a user toggled a setting and navigated away *without* committing, the form would reset to server values on return (correct behavior). However, if they *did* commit and it still reset, it implies a stale query cache or a default value issue. I will ensure the form strictly follows server values and the "Commit Changes" action handles both flags correctly.

## Proposed Changes

### Database & Server Functions
- **merchant.functions.ts**:
    - Ensure `getWorkspace` returns the actual `allow_negotiation` and `allow_upsell` values from the database. (Already doing this, will verify).
    - Ensure `updatePolicy` correctly updates both flags in the `merchant_policies` table. (Already doing this, will verify).

### Frontend (Policies Page)
- **policies.tsx**:
    - Update `useEffect` to synchronize the form state with the latest `workspace.data` from the server, even if the form is not null, but only when not currently editing (or handle it via query state directly).
    - Ensure the `Switch` components are correctly bound to the form state.
    - Explicitly verify that "Commit Changes" sends the current state of both toggles.

### Server-Side Enforcement
- **negotiation.server.ts**:
    - Verify `decideDiscount` and `runNegotiationRound` strictly use the `allow_negotiation` flag from the database policy.
    - Verify `eligibleGrowthRecommendations` strictly uses the `allow_upsell` flag from the database policy.
- **agent.functions.ts**:
    - Verify `respondToRecommendation` enforces the `allow_upsell` policy before accepting.

### UI Visual Edits
- **dashboard.tsx**:
    - Apply the requested visual text edits to the "Authority Pipeline" header as literal text.

## Technical Details
- Integer math is already preserved in `merchant.functions.ts` and `quote.ts`.
- `TanStack Query` invalidation will be used to ensure the dashboard and policies page stay in sync after updates.
- Server-side logic will remain the single source of truth for commercial boundaries.
