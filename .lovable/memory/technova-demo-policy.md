---
name: TechNova canonical demo policy
description: Canonical merchant policy values for the TechNova demo store; guards against config drift from testing.
type: feature
---
Canonical TechNova Store (slug `technova-store`) policy — restore these exact values if testing drifts them:

- max_discount_percent = 12
- max_order_value = 100000 (INR)
- approval_required_above = 50000 (INR)
- allow_negotiation = true
- allow_upsell = true

Drift has happened twice (10% discount, 200000 max order) from saving the Policies form during verification. After UI verification that writes the policy form, always restore these values.

Docs on `/agent-api` must stay consistent with real seeded data: DeveloperBook Pro 15 at 55000; a 50% discount request caps to 12% → discount 6600, final 48400; 3 units (165000) correctly returns `order_value_exceeded` against the 100000 cap. Never hardcode policy numbers in quote logic — the database row is the source of truth.
