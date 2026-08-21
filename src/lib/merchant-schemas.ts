import { z } from "zod";

export const productInputSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  description: z.string().trim().max(1000).optional().default(""),
  category: z.string().trim().max(80).optional().default(""),
  price: z.number().nonnegative("Price cannot be negative").max(100000000),
  stock_quantity: z.number().int("Stock must be a whole number").min(0).max(1000000),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const createProductSchema = productInputSchema;
export const updateProductSchema = productInputSchema.extend({ id: z.string().uuid() });
export const updateStockSchema = z.object({
  id: z.string().uuid(),
  stock_quantity: z.number().int().min(0).max(1000000),
});
export const toggleProductSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "inactive"]),
});

export const policySchema = z.object({
  max_discount_percent: z.number().min(0).max(100),
  max_order_value: z.number().min(0).max(1000000000),
  approval_required_above: z.number().min(0).max(1000000000),
  allow_negotiation: z.boolean(),
  allow_upsell: z.boolean(),
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type PolicyInput = z.infer<typeof policySchema>;

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  currency: string;
  stock_quantity: number;
  status: "active" | "inactive";
  updated_at: string;
};

export type WorkspaceSummary = {
  merchant: {
    id: string;
    name: string;
    description: string | null;
    currency: string;
    status: "active" | "inactive";
  };
  policy: PolicyInput & { id: string };
  stats: {
    totalProducts: number;
    activeProducts: number;
    totalInventoryUnits: number;
    inventoryValue: number;
  };
  roles: string[];
  profile: { full_name: string | null; email: string | null };
};
