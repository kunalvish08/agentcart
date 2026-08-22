# End-to-End Mobile Responsiveness for Agentic Commerce

Implement a comprehensive mobile-responsive design across all pages and components while maintaining the professional Obsidian Commerce aesthetic.

## 1. Global Navigation & Layout
- **AppShell**: Convert the desktop sidebar into a mobile-friendly slide-in drawer/sheet.
- **Header**: Refine for compact screens, ensuring brand, theme toggle, and user actions are accessible without overflow.
- **Global CSS**: Fix potential horizontal overflow sources, set natural text wrapping, and scale typography responsively.

## 2. Page-Specific Redesigns (Mobile)
- **Dashboard**: Stack metrics into a 2-column grid; convert the "Authority Pipeline" into a vertical layout; stack activity logs.
- **AI Buyer**: Linearize the interface (Intent -> Agent Controls -> Workspace -> Trace -> Authority).
- **Buyer Lab**: Convert the horizontal simulator into a vertical configuration-to-execution pipeline.
- **Approvals**: Transform horizontal queue rows into detailed cards; stack financial breakdowns and timelines.
- **Products**: Redesign the product table as a set of high-density cards with inline stock editing and technical indicators.
- **Policies**: Stack policy fields and toggles; ensure the "Server Authority" panel remains readable and prominent.
- **Evaluation Lab**: Stack methodology cards; convert side-by-side impact comparisons into sequential sections.
- **Judge Mode**: Stack the "Money Authority Chain" and telemetry; convert the execution trace into a vertical, expandable card-based timeline.

## 3. Component & Technical Polish
- **Tables**: Implement internal horizontal scrolling for technical data only when cards are not suitable; ensure no page-level overflow.
- **Modals/Dialogs**: Ensure all dialogs fit within the viewport with proper padding and internal scrolling.
- **Technical Content**: Apply wrapping and monospace styling for UUIDs, API endpoints, and IDs to prevent layout breakages.

## Technical Details
- Use Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`) to manage layouts across breakpoints.
- Leverage Framer Motion's `layout` prop where needed for smooth transitions between mobile/desktop states.
- Ensure all touch targets are at least 44px for accessibility.
- Maintain Obsidian theme tokens (`oklch`) for color consistency in both light and dark modes.
