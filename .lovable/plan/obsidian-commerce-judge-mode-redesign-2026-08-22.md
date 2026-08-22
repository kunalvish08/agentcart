# Obsidian Commerce Judge Mode Redesign

Redesign the `/judge` page into a professional enterprise AI-commerce observability console, emphasizing server authority and end-to-end audibility.

## Visual Language
- **Identity**: Stripe-like high-density infrastructure dashboard.
- **Palette**: Obsidian #0A0D12 (background), Graphite #121821 (surfaces), Copper #D59B62 (authority/pending), Verified Green #46B58A (success/enforced).
- **Typography**: Inter (UI) + JetBrains Mono (Technical data/IDs).
- **Motion**: Staggered reveals, `CountUp` for KPIs, sequential trace highlights.

## Proposed Changes

### 1. Layout Refactor
- Replace standard `AppShell` usage with a custom compact header specifically for Judge Mode.
- Main hero section: **Money Authority Chain** visual (connected nodes Merchant → AI → API → Policy → Payment).
- KPI section: Compact telemetry cards with `CountUp` animations.

### 2. Components
- **ArchitectureNode**: High-density nodes for the "Money Authority" chain.
- **ObservabilityTimeline**: Refactored trace showing Step · Actor · Operation · Latency · Status.
- **SecurityEvidenceTable**: Dense enterprise table for RLS and policy proofs.

### 3. Trace Redesign
- Map the 11-step judge demo trace to a professional timeline.
- Staggered reveals for trace items.
- Highlighting specific negotiation steps (Request vs Cap vs Counter).

### 4. Technical Details
- Use `framer-motion` for all interactions.
- Ensure strict theme-token usage (Obsidian palette).
- No hardcoded `text-black` or `bg-white`.
- Persistent "SERVER-AUTHORITATIVE" indicators.

## Verification
- `tsgo` for type checks.
- Build test to ensure no SSR mismatches.
- Viewport check for responsiveness (zero horizontal scroll).
