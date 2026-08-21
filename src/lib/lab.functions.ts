// Phase 09 — Evaluation Lab server functions (thin authenticated wrappers only).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LabOverview, RunDetail } from "@/lib/evaluation-read.server";

const createSchema = z.object({
  label: z.string().trim().min(1).max(120),
  sample_size: z.number().int().min(1).max(240),
  batch_size: z.number().int().min(1).max(25),
  include_safety: z.boolean(),
});

const runIdSchema = z.object({ run_id: z.string().uuid() });

const statusSchema = z.object({
  run_id: z.string().uuid(),
  status: z.enum(["queued", "paused", "cancelled"]),
});

export const getLabOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LabOverview> => {
    const { labOverview } = await import("@/lib/evaluation-read.server");
    return labOverview(context.userId);
  });

export const getEvaluationRun = createServerFn({ method: "GET" })
  .inputValidator((data: { run_id: string }) => runIdSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<RunDetail | null> => {
    const { runDetail } = await import("@/lib/evaluation-read.server");
    return runDetail(context.userId, data.run_id);
  });

export const createEvaluationRunFn = createServerFn({ method: "POST" })
  .inputValidator((data: { label: string; sample_size: number; batch_size: number; include_safety: boolean }) =>
    createSchema.parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { createEvaluationRun } = await import("@/lib/evaluation-worker.server");
    return createEvaluationRun({
      userId: context.userId,
      label: data.label,
      sampleSize: data.sample_size,
      batchSize: data.batch_size,
      includeSafety: data.include_safety,
    });
  });

export const processEvaluationBatchFn = createServerFn({ method: "POST" })
  .inputValidator((data: { run_id: string }) => runIdSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { processEvaluationBatch } = await import("@/lib/evaluation-worker.server");
    const request = getRequest();
    return processEvaluationBatch({
      runId: data.run_id,
      userId: context.userId,
      baseUrl: new URL(request.url).origin,
      signal: request.signal,
    });
  });

export const setEvaluationRunStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: { run_id: string; status: "queued" | "paused" | "cancelled" }) =>
    statusSchema.parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { setEvaluationRunStatus } = await import("@/lib/evaluation-worker.server");
    return setEvaluationRunStatus({ runId: data.run_id, userId: context.userId, status: data.status });
  });
