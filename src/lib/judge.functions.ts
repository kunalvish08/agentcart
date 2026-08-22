// Phase 07 — Judge Mode server functions (thin authenticated wrappers only).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ChaosScenarioId } from "@/lib/judge-facts";
import type {
  ChaosResult,
  JudgeDemoResult,
  JudgeEvidence,
  JudgeReplay,
  JudgeRunSummary,
  MoneyAuthorityProof,
  ResetResult,
} from "@/lib/judge.server";

const chaosSchema = z.object({
  scenario: z.enum([
    "duplicate_checkout",
    "duplicate_webhook",
    "invalid_webhook_signature",
    "expired_quote",
    "insufficient_inventory",
    "policy_violation",
    "payment_state_guard",
  ]),
});

export const runJudgeDemo = createServerFn({ method: "POST" })
  .inputValidator((data: { chaosMode?: boolean } | undefined) => z.object({ chaosMode: z.boolean().optional() }).optional().parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<JudgeDemoResult> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { runJudgeDemo } = await import("@/lib/judge.server");
    return runJudgeDemo({
      userId: context.userId,
      baseUrl: new URL(getRequest().url).origin,
      chaosMode: data?.chaosMode ?? false
    });
  });

export const runJudgeChaos = createServerFn({ method: "POST" })
  .inputValidator((data: { scenario: ChaosScenarioId }) => chaosSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<ChaosResult> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { runChaosScenario } = await import("@/lib/judge.server");
    return runChaosScenario({
      scenario: data.scenario,
      userId: context.userId,
      baseUrl: new URL(getRequest().url).origin,
    });
  });

export const getJudgeEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<JudgeEvidence | null> => {
    const { judgeEvidenceForUser } = await import("@/lib/judge.server");
    return judgeEvidenceForUser(context.userId);
  });

export const getJudgeProof = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MoneyAuthorityProof | null> => {
    const { moneyProofForUser } = await import("@/lib/judge.server");
    return moneyProofForUser(context.userId);
  });

export const getJudgeRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<JudgeRunSummary[]> => {
    const { listJudgeRuns } = await import("@/lib/judge.server");
    return listJudgeRuns(context.userId);
  });

export const getJudgeReplay = createServerFn({ method: "GET" })
  .inputValidator((data: { runId: string }) => z.object({ runId: z.string().uuid() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<JudgeReplay> => {
    const { replayJudgeRun } = await import("@/lib/judge.server");
    return replayJudgeRun({ runId: data.runId, userId: context.userId });
  });

export const resetJudgeDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResetResult> => {
    const { resetJudgeDemo } = await import("@/lib/judge.server");
    return resetJudgeDemo({ userId: context.userId });
  });
