# Obsidian Commerce Design System Implementation

Implement the premium "Obsidian Commerce" visual identity across the entire Agentic Commerce platform. This phase ensures visual cohesion, introduces a global light/dark theme system, and refines typography, layout, and motion language.

## Design Identity: Obsidian Commerce
- **Dark Theme:** Obsidian (#0A0D12), Graphite (#121821), Slate (#1B2430), Border (#26313D).
- **Light Theme:** Background (#F5F6F4), Surface (#FFFFFF), Border (#D9DED9).
- **Accents:** Copper (#D59B62) as the primary brand color, Verified Green (#46B58A), Approval Amber (#D8A24A), Error Coral (#D66B6B).
- **Typography:** Modern sans-serif for UI, editorial headings, monospace for technical IDs/paths.
- **Form:** Low-radius corners, restrained borders, infrastructure-like panels.

## User-Facing Changes

### Global Theme System
- Implement a global `next-theme` inspired system for persistence and system-preference detection.
- Add a subtle Sun/Moon toggle in the header of `AppShell.tsx` and the landing page nav.
- Smooth CSS transitions for all color changes.

### Cohesive Component Redesign
- **AppShell & Navigation:** Update shared navigation to use Obsidian colors and Copper active state.
- **Infrastructure Panels:** Standardize all cards across Dashboard, Approvals, Products, Policies, and Lab.
- **Status Language:** Unified colors for statuses (Live: Green, Pending: Amber, Failed: Coral, Authoritative: Copper).

### Page-Specific Refinements
- **Landing (/) & Login (/login):** Align with Obsidian palette and infrastructure aesthetic.
- **Dashboard:** Emphasize the commerce flow with high-contrast Obsidian technical panels.
- **Buyer & Buyer Lab:** Refine the agent workflow visualization to look like technical commerce infrastructure.
- **Evaluation Lab & Judge Mode:** Polish the experimental/control-room feel with consistent Obsidian tokens.

## Technical Details

### Styling Infrastructure
- Update `src/styles.css` with the new oklch color tokens for the Obsidian palette.
- Implement Tailwind v4 dark mode handling (class-based).
- Refine the global motion system in a shared utility or component logic (150-800ms timings).

### Component Updates
- **src/components/AppShell.tsx:** Redesign sidebar and header. Add theme toggle.
- **src/components/ui/*.tsx:** Ensure shadcn components use the new semantic variables correctly (border, ring, primary, etc.).
- **src/routes/*.tsx:** Update all route components to use the new layout spacing and typography hierarchy.

## Implementation Steps

1. **Tokens:** Update `src/styles.css` with the Obsidian palette (light and dark).
2. **Theme Engine:** Implement the theme toggle and context in `src/routes/__root.tsx`.
3. **Shared UI:** Redesign `AppShell.tsx` and global components.
4. **Route Polish:** Batch update all routes (/dashboard, /products, etc.) to use standardized Obsidian panels and typography.
5. **Motion:** Refine Framer Motion animations to be sequential and purposeful.
