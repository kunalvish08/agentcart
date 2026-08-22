# Merchant Dashboard Redesign Plan

Redesign the Merchant Dashboard UI to feel like a premium B2B AI-commerce control plane, focusing on information hierarchy and the "Merchant → AI Buyer → Server Authority" story.

## User Review Required

> [!IMPORTANT]
> - This is a UI/UX-only change. All business logic, database RLS, and payment safety guards remain untouched.
> - The design will use a clean, high-density aesthetic with a focus on server-side authority.

## Proposed Changes

### 1. Dashboard Structure (`src/routes/_authenticated/dashboard.tsx`)
- **Hero Section**: New high-density hero with a "Commerce Chain" visualization (Catalog → AI Buyer → Server Authority → Approval → Razorpay → Completed).
- **Store Overview**: Compact metrics grid for inventory and product stats, removing generic card styling.
- **Commercial Rules**: Focused panel for discount and order limits, emphasizing "AI may request. Policy decides."
- **AI Commerce Status**: System-status panel showing the health of the public API and active agent commerce flags.
- **Negotiation & Growth**: Visualized flow of List Value → Final Offer → Discount, emphasizing server-side policy enforcement.
- **Checkout Pipeline**: State-based progress bar for active orders (Requested → Approval → Payment → Completed).
- **Judge Mode Summary**: Compact "Proof" section with a CTA to the full control room.
- **Activity Timeline**: Clean vertical timeline using existing audit/transaction data.

### 2. Styling and Components
- **Typography**: Refined hierarchy using existing shadcn tokens, emphasizing deep navy tones for headings.
- **Motion**: Subtle entry animations using `framer-motion` for section reveals.
- **Responsive**: Grid layouts that stack vertically on mobile while maintaining the "story" flow.

## Technical Details
- **Data Preservation**: Uses the existing `useQuery` hooks for `workspace`, `growth-metrics`, `checkout-metrics`, and `payment-metrics`.
- **Server Functions**: No changes to `getWorkspace`, `getGrowthMetrics`, etc.
- **Lucide Icons**: Uses existing icon set (`Bot`, `ShieldCheck`, `Gavel`, etc.) for consistency.
- **Tailwind v4**: Leverages semantic color tokens (`--primary`, `--muted-foreground`) to maintain dark mode compatibility.
