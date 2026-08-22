# Plan: Animate External AI Buyer Lab

Animate ONLY the existing `/buyer-lab` page. The existing UI, layout, copy, colors, and data are final. No redesign, no structural changes, no visible text additions, and no backend/business logic modifications.

## User Review Required

> [!IMPORTANT]
> This plan focuses strictly on adding a motion layer to communicate actual system execution. All current data fetching and logic remain unchanged.

- **Do the animation timings (150ms to 700ms) align with your expectations for a professional tool?**
- **Is the sequential reveal order for the page load correct?**

## Proposed Changes

### Animation Layer (`src/routes/_authenticated/buyer-lab.tsx`)

#### 1. Page Load & Layout Stagger
- Use `framer-motion`'s `variants` to stagger the reveal of:
  - Header -> Simulator Console -> Boundaries -> Initialize External Agent -> A2A Journey -> Outcome -> API Traffic -> Trace -> Report -> Evaluation -> Tool Reliability -> Endpoint Traffic.
- Motion: `opacity: 0` to `1`, `y: 12` to `0`.
- Respect `prefers-reduced-motion` (opacity only).

#### 2. Interactive Micro-animations
- **Scenario Buttons:** 2px lift, border transition on hover (200ms).
- **Launch Agent Button:** Hover elevation, active (pressed) scale 0.98.

#### 3. Agent-to-Agent Journey (Sequential Pipeline)
- Animate `A2A_STAGES` as a sequence.
- **Active Step:** Scale (0.98 to 1), border highlight, opacity 1.
- **Connectors:** Progressive animation between stages when the previous one completes (based on `run.calls` and `run.steps`).
- **Actor Highlighting:** Subtle background/border color emphasis for `buyer`, `server`, `merchant`, `razorpay` based on current stage.

#### 4. Real-time Data Feeds
- **API Traffic Log:** New rows slide in from the right (`x: 6` to `0`) and fade in. Status colors transition smoothly.
- **Execution Trace:** Sequential reveal of trace entries using `AnimatePresence`.
- **Outcome Panels:** Fade + slide up reveal when `state` becomes available.
- **Buyer Report:** Upward slide and fade when final text is available.

#### 5. Evaluation & Performance Tables
- **CountUp Metrics:** Use existing `CountUp` component for `runs`, `quotes`, `offers`, and `calls` on viewport entry.
- **Table Stagger:** Small stagger for `Tool Reliability` and `Endpoint Traffic` rows on entry.
- **Value Updates:** Brief highlight/transition when success/fail counts update in real-time.

### Components (`src/components/dashboard/CountUp.tsx`)
- Ensure it handles various numeric formats correctly for the Lab's metrics.

## Technical Details

- **Framer Motion:** Use `layout`, `initial`, `animate`, and `variants`.
- **Performance:** Use `useReducedMotion` hook.
- **Data Binding:** Animations will be driven by the existing `run` state and `metrics` query.

## Constraints & Compliance
- **No Redesign:** JSX structure is preserved.
- **No Visible Text:** No new labels or descriptions.
- **No Fake Data:** Animations only trigger on actual state changes.
- **Theme:** Strict adherence to Obsidian Commerce colors.
