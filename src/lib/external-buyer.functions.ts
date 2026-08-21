// Phase 08 — thin authenticated wrappers for external-buyer evaluation metrics.
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ExternalBuyerMetrics } from "@/lib/external-buyer-metrics.server";

export const getExternalBuyerMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExternalBuyerMetrics> => {
    const { collectExternalBuyerMetrics } = await import("@/lib/external-buyer-metrics.server");
    return collectExternalBuyerMetrics(context.userId);
  });
