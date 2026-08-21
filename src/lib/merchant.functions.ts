import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createProductSchema,
  policySchema,
  toggleProductSchema,
  updateProductSchema,
  updateStockSchema,
  type PolicyInput,
  type ProductInput,
  type ProductRow,
  type WorkspaceSummary,
} from "@/lib/merchant-schemas";

/**
 * Loads (and if needed bootstraps) the signed-in user's merchant workspace.
 * The merchant is always derived from the authenticated user, never from input.
 */
export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceSummary> => {
    const { supabase, userId } = context;

    const bootstrap = await supabase.rpc("bootstrap_current_user", {});
    if (bootstrap.error) throw new Error(bootstrap.error.message);

    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id, name, description, currency, status, slug, agent_commerce_enabled")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (merchantError) throw new Error(merchantError.message);
    if (!merchant) throw new Error("No merchant found for this account");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [policyResult, productsResult, rolesResult, profileResult, logsResult] = await Promise.all([
      supabase
        .from("merchant_policies")
        .select(
          "id, max_discount_percent, max_order_value, approval_required_above, allow_negotiation, allow_upsell",
        )
        .eq("merchant_id", merchant.id)
        .maybeSingle(),
      supabase
        .from("products")
        .select("price, stock_quantity, status")
        .eq("merchant_id", merchant.id),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
      supabase
        .from("api_request_logs")
        .select("success, created_at")
        .eq("merchant_id", merchant.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (policyResult.error) throw new Error(policyResult.error.message);
    if (productsResult.error) throw new Error(productsResult.error.message);

    const products = productsResult.data ?? [];
    const policy = policyResult.data;

    return {
      merchant,
      policy: {
        id: policy?.id ?? "",
        max_discount_percent: Number(policy?.max_discount_percent ?? 0),
        max_order_value: Number(policy?.max_order_value ?? 0),
        approval_required_above: Number(policy?.approval_required_above ?? 0),
        allow_negotiation: policy?.allow_negotiation ?? false,
        allow_upsell: policy?.allow_upsell ?? false,
      },
      stats: {
        totalProducts: products.length,
        activeProducts: products.filter((p) => p.status === "active").length,
        totalInventoryUnits: products.reduce((sum, p) => sum + (p.stock_quantity ?? 0), 0),
        inventoryValue: products.reduce(
          (sum, p) => sum + Number(p.price ?? 0) * (p.stock_quantity ?? 0),
          0,
        ),
      },
      agentApi: {
        requests24h: (logsResult.data ?? []).length,
        failures24h: (logsResult.data ?? []).filter((l) => !l.success).length,
        lastRequestAt: logsResult.data?.[0]?.created_at ?? null,
      },
      roles: (rolesResult.data ?? []).map((r) => r.role as string),
      profile: {
        full_name: profileResult.data?.full_name ?? null,
        email: profileResult.data?.email ?? null,
      },
    };
  });

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProductRow[]> => {
    const { supabase, userId } = context;

    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (merchantError) throw new Error(merchantError.message);
    if (!merchant) return [];

    const { data, error } = await supabase
      .from("products")
      .select("id, name, description, category, price, currency, stock_quantity, status, updated_at")
      .eq("merchant_id", merchant.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    return (data ?? []).map((p) => ({ ...p, price: Number(p.price) })) as ProductRow[];
  });

export const createProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ProductInput) => createProductSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id, currency")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (merchantError) throw new Error(merchantError.message);
    if (!merchant) throw new Error("No merchant found for this account");

    const { data: inserted, error } = await supabase
      .from("products")
      .insert({
        merchant_id: merchant.id,
        name: data.name,
        description: data.description || null,
        category: data.category || null,
        price: data.price,
        currency: merchant.currency,
        stock_quantity: data.stock_quantity,
        status: data.status,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { id: inserted.id };
  });

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ProductInput & { id: string }) => updateProductSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: merchant } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!merchant) throw new Error("No merchant found for this account");

    const { error } = await supabase
      .from("products")
      .update({
        name: data.name,
        description: data.description || null,
        category: data.category || null,
        price: data.price,
        stock_quantity: data.stock_quantity,
        status: data.status,
      })
      .eq("id", data.id)
      .eq("merchant_id", merchant.id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const updateStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; stock_quantity: number }) => updateStockSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: merchant } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!merchant) throw new Error("No merchant found for this account");

    const { error } = await supabase
      .from("products")
      .update({ stock_quantity: data.stock_quantity })
      .eq("id", data.id)
      .eq("merchant_id", merchant.id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const setProductStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: "active" | "inactive" }) =>
    toggleProductSchema.parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: merchant } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!merchant) throw new Error("No merchant found for this account");

    const { error } = await supabase
      .from("products")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("merchant_id", merchant.id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const updatePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: PolicyInput) => policySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: merchant } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!merchant) throw new Error("No merchant found for this account");

    if (data.approval_required_above > data.max_order_value) {
      throw new Error("Approval threshold cannot exceed the maximum order value");
    }

    const { error } = await supabase
      .from("merchant_policies")
      .update({
        max_discount_percent: data.max_discount_percent,
        max_order_value: data.max_order_value,
        approval_required_above: data.approval_required_above,
        allow_negotiation: data.allow_negotiation,
        allow_upsell: data.allow_upsell,
      })
      .eq("merchant_id", merchant.id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export type GrowthMetrics = {
  negotiations: number;
  openNegotiations: number;
  rounds: number;
  countered: number;
  avgApprovedDiscount: number;
  offers: number;
  offerValue: number;
  listValue: number;
  discountGiven: number;
  recommendations: number;
  acceptedRecommendations: number;
};

/**
 * Phase 04 revenue foundation. Every figure is aggregated from server-persisted
 * negotiation rounds and offers (RLS-scoped to the caller's merchant).
 */
export const getGrowthMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GrowthMetrics> => {
    const { supabase, userId } = context;

    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", userId)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (merchantError) throw new Error(merchantError.message);
    const empty: GrowthMetrics = {
      negotiations: 0,
      openNegotiations: 0,
      rounds: 0,
      countered: 0,
      avgApprovedDiscount: 0,
      offers: 0,
      offerValue: 0,
      listValue: 0,
      discountGiven: 0,
      recommendations: 0,
      acceptedRecommendations: 0,
    };
    if (!merchant) return empty;

    const sessions = await supabase
      .from("negotiation_sessions")
      .select("id, status")
      .eq("merchant_id", merchant.id);
    if (sessions.error) throw new Error(sessions.error.message);
    const sessionIds = (sessions.data ?? []).map((s) => s.id);

    const [rounds, offers, recs] = await Promise.all([
      sessionIds.length
        ? supabase
            .from("negotiation_rounds")
            .select("id, policy_decision, allowed_discount_percent")
            .in("session_id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
      sessionIds.length
        ? supabase
            .from("offers")
            .select("id, base_amount, final_amount")
            .in("negotiation_session_id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("growth_recommendations").select("id, accepted").eq("merchant_id", merchant.id),
    ]);
    for (const r of [rounds, offers, recs]) {
      if (r.error) throw new Error(r.error.message);
    }

    const roundRows = rounds.data ?? [];
    const offerRows = offers.data ?? [];
    const approved = roundRows.map((r) => Number(r.allowed_discount_percent ?? 0));
    const listValue = offerRows.reduce((sum, o) => sum + Number(o.base_amount ?? 0), 0);
    const offerValue = offerRows.reduce((sum, o) => sum + Number(o.final_amount ?? 0), 0);

    return {
      negotiations: (sessions.data ?? []).length,
      openNegotiations: (sessions.data ?? []).filter((s) => s.status === "open").length,
      rounds: roundRows.length,
      countered: roundRows.filter((r) => r.policy_decision === "counter").length,

      avgApprovedDiscount: approved.length
        ? Math.round((approved.reduce((a, b) => a + b, 0) / approved.length) * 100) / 100
        : 0,
      offers: offerRows.length,
      offerValue,
      listValue,
      discountGiven: Math.max(0, listValue - offerValue),
      recommendations: (recs.data ?? []).length,
      acceptedRecommendations: (recs.data ?? []).filter((r) => r.accepted).length,
    };
  });
