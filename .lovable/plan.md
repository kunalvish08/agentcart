# Phase 01 — Agentic Commerce Foundation

Secure foundation only: database, auth, roles, merchant/product/policy management, seeded demo data. No AI, payments, checkout, or agent features.

## What you'll be able to do

- Sign in at `/login` with the seeded demo merchant (`demo@technova.test`, password shown after build) or create a new account (instant login, no email confirmation).
- `/dashboard` — merchant name, total products, total inventory units, active products, current max discount, max order value.
- `/products` — list, create, edit, update stock, activate/deactivate.
- `/policies` — view and edit max discount, max order value, approval threshold, negotiation and upsell toggles.
- New signups automatically get a profile, a `merchant` role, their own merchant record, and a default policy row — so they see their own empty store, never TechNova's data.

## Database (Lovable Cloud / PostgreSQL)

Enable Lovable Cloud, then one migration creating enums (`app_role`, `entity_status`, `relation_type`) and tables exactly as specified: `profiles`, `user_roles`, `merchants`, `products`, `merchant_policies`, `product_relations`. Numeric money columns, JSONB `metadata`, `INR` defaults, timestamps with an `updated_at` trigger, indexes on `merchant_id` / `owner_id` / `user_id`.

Roles live only in `user_roles`. A `SECURITY DEFINER` function `has_role(uuid, app_role)` is used inside policies to avoid recursive RLS, plus `owns_merchant(uuid)` for merchant-scoped checks.

## Security

- Grants issued per table (`authenticated`, `service_role`), then RLS enabled, then policies — no anon grants.
- `profiles`: self read/update only.
- `user_roles`: user reads own rows; no client-side writes (assigned by trigger/admin).
- `merchants`: full access where `owner_id = auth.uid()`; admins full access via `has_role`.
- `products`, `merchant_policies`: full access when the parent merchant is owned by the caller; admin override.
- `product_relations`: policies check both `product_id` and `related_product_id` resolve to merchants owned by the caller; admin override.
- Trigger on new auth user creates profile + `merchant` role + merchant + default policy.
- All writes go through `createServerFn` handlers using `requireSupabaseAuth`, so authorization is enforced server-side and by RLS; route guards are UX only. No service-role key or secret ever reaches the browser.

## Seed data (literal INSERTs in the migration)

Demo auth user + profile + `merchant` role; merchant **TechNova Store** ("AI-native electronics merchant for developer and technology products.", INR, active); the five products with the given categories, prices and stock; policy `12 / 100000 / 50000 / negotiation on / upsell on`; four `cross_sell` relations from DeveloperBook Pro 15 to Mouse, Stand, Keyboard, USB-C Hub.

## Frontend

- `/login` — email+password sign in / sign up tabs, session-aware redirect to `/dashboard`, demo credentials shown on the card.
- `/dashboard`, `/products`, `/policies` live under the protected `_authenticated` layout; `/` is a short public landing page with a sign-in CTA.
- Header reflects session state with a sign-out action.
- Data flows through TanStack Query + server functions; forms use zod validation, mutations invalidate queries, toasts via sonner.
- Design: clean professional merchant console — dark-slate sidebar shell, teal/indigo accent, tabular product table, semantic tokens in `src/styles.css` (no hardcoded colors).

## Technical notes

- Server functions live in client-safe `*.functions.ts` modules; every handler validates input and re-derives `merchant_id` from the caller, never from request data.
- Auto-confirm email enabled via the auth config tool so signup logs in immediately.
- Verification before finishing: run the security scan, browser-test real login → dashboard → product create/edit/stock/toggle → policy edit, confirm cross-tenant reads return nothing, and confirm a clean typecheck/build.
