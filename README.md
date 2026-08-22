# Merchant Foundation

Build Phase 01 of an AI-native Agentic Commerce platform for the Razorpay AI Builder Internship 2026 Track 01: AI Growth & Agentic Commerce.

IMPORTANT:

Do not build the AI Buyer, payment integration, Razorpay integration, checkout, agent orchestration, evaluation lab, or advanced dashboards yet.

This phase is ONLY the secure application foundation, database schema, authentication, roles, merchant management, products, inventory, merchant policies, and seed demo data.

TECH STACK:

- React + TypeScript

- TanStack Start / server functions

- Supabase/PostgreSQL

- Supabase Auth

- Tailwind

- Lovable Cloud

ARCHITECTURE PRINCIPLES:

1. Never expose secrets to the browser.

2. Use server-side authorization for protected operations.

3. Use PostgreSQL Row Level Security for tenant isolation.

4. Keep user roles in a separate user_roles table rather than storing roles directly on profiles.

5. Every merchant-owned table must have merchant_id and appropriate RLS.

6. Financial authority will later be enforced server-side, not by LLM prompts.

7. Keep the schema extensible for future agent runs, negotiations, orders, payments, audit logs, and evaluations.

DATABASE TABLES:

1. profiles

- id UUID primary key, references auth.users

- full_name

- email

- created_at

- updated_at

2. user_roles

- id UUID primary key

- user_id UUID references auth.users

- role enum: merchant, admin, demo_buyer

- created_at

- unique constraint on user_id + role

3. merchants

- id UUID primary key

- owner_id UUID references auth.users

- name

- description

- currency default INR

- status enum: active, inactive

- created_at

- updated_at

4. products

- id UUID primary key

- merchant_id UUID references merchants

- name

- description

- category

- price numeric

- currency default INR

- stock_quantity integer

- status enum: active, inactive

- metadata JSONB

- created_at

- updated_at

5. merchant_policies

- id UUID primary key

- merchant_id UUID references merchants

- max_discount_percent numeric

- max_order_value numeric

- approval_required_above numeric

- allow_negotiation boolean

- allow_upsell boolean

- created_at

- updated_at

6. product_relations

- id UUID primary key

- product_id UUID references products

- related_product_id UUID references products

- relation_type enum: upsell, cross_sell, alternative

- priority integer default 0

- created_at

SECURITY:

Implement proper RLS policies.

Users can only access their own profile.

Merchants can only manage merchants they own.

Merchants can only create/read/update/delete their own products.

Merchants can only manage their own merchant policies.

Product relations must only be accessible when the associated products belong to a merchant the current user owns.

Admins can access all merchant data.

Do not rely only on frontend route protection. Enforce authorization at the database/server level.

CREATE A DEMO MERCHANT:

Name:

TechNova Store

Description:

AI-native electronics merchant for developer and technology products.

Currency:

INR

Create these demo products:

1. DeveloperBook Pro 15

Category: Laptops

Price: 55000

Stock: 25

2. Wireless Mouse

Category: Accessories

Price: 799

Stock: 100

3. Laptop Stand

Category: Accessories

Price: 1499

Stock: 50

4. Mechanical Keyboard

Category: Accessories

Price: 2999

Stock: 40

5. USB-C Hub

Category: Accessories

Price: 1299

Stock: 60

Create merchant policy:

max_discount_percent = 12

max_order_value = 100000

approval_required_above = 50000

allow_negotiation = true

allow_upsell = true

Create product relationships:

DeveloperBook Pro 15 → Wireless Mouse → cross_sell

DeveloperBook Pro 15 → Laptop Stand → cross_sell

DeveloperBook Pro 15 → Mechanical Keyboard → cross_sell

DeveloperBook Pro 15 → USB-C Hub → cross_sell

UI REQUIREMENTS:

Create a clean professional Merchant Dashboard.

Pages:

/login

/dashboard

/products

/policies

Dashboard should show:

- Merchant name

- Total products

- Total inventory units

- Active products

- Current maximum discount

- Maximum order value

Products page:

- List products

- Create product

- Edit product

- Update stock

- Activate/deactivate product

Policies page:

- Show current merchant policies

- Edit allowed discount

- Edit maximum order value

- Toggle negotiation

- Toggle upsell

- Configure approval threshold

DO NOT create fake AI functionality.

DO NOT create fake Razorpay payments.

DO NOT create fake agent traces.

Everything in this phase should use the real database and authentication.

At the end, verify:

1. Authentication works.

2. Merchant can log in.

3. Merchant can only access its own data.

4. RLS is active.

5. Demo merchant and products exist.

6. Policies are stored in PostgreSQL.

7. Product relationships are stored correctly.

8. No secrets are exposed client-side.

9. No TypeScript/build errors.

10. The application runs successfully.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://agentcart.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9c4ecdc5-2b8b-42f2-aca7-a843f42cf765).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
