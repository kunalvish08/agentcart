import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { 
  AlertTriangle, 
  BarChart3, 
  Beaker, 
  CircleDollarSign, 
  Database, 
  Gauge, 
  Loader2, 
  Pause, 
  Play, 
  ShieldCheck, 
  TrendingUp,
  ChevronRight,
  Info,
  Shield
} from "lucide-react";
import { motion } from "framer-motion";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CATEGORY_LABELS, OUTCOME_LABELS } from "@/lib/evaluation-dataset";
import { cn } from "@/lib/utils";
import {
  createEvaluationRunFn,
  getEvaluationRun,
  getLabOverview,
  processEvaluationBatchFn,
  setEvaluationRunStatusFn,
} from "@/lib/lab.functions";
import type { ArmMetrics } from "@/lib/evaluation-metrics.server";
import type { ResultRowView, RunSummary } from "@/lib/evaluation-read.server";
import { getWorkspace } from "@/lib/merchant.functions";
import { CountUp } from "@/components/dashboard/CountUp";

export const Route = createFileRoute("/_authenticated/lab")({
  head: () => ({
    meta: [
      { title: "Evaluation Lab · Benchmark agentic commerce" },
    ],
  }),
  component: LabPage,
});

const money = (amount: number | null | undefined, currency = "INR") =>
  amount === null || amount === undefined
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount);

const pct = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? "—" : `${value.toFixed(digits)}%`;

function signed(value: number, suffix: string, digits = 1) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${suffix}`;
}

function DeltaBadge({ value, suffix = "pp" }: { value: number | null; suffix?: string }) {
  if (value === null) return <Badge variant="outline">n/a</Badge>;
  const tone =
    value > 0.05
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
      : value < -0.05
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-muted bg-muted/40 text-muted-foreground";
  return <Badge className={cn("rounded-sm font-bold font-mono", tone)} variant="outline">{signed(value, suffix)}</Badge>;
}

function MetricRow({ label, traditional, agentic, delta, hint }: { label: string; traditional: string; agentic: string; delta?: React.ReactNode; hint?: string }) {
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
      <div>
        <p className="text-[11px] font-bold text-foreground">{label}</p>
        {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
      </div>
      <p className="text-[11px] font-mono text-muted-foreground">{traditional}</p>
      <p className="text-[11px] font-mono font-semibold text-foreground">{agentic}</p>
      <div className="justify-self-end">{delta}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
      : status === "running"
        ? "border-blue-500/40 bg-blue-500/10 text-blue-600"
        : status === "failed" 
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-muted bg-muted/40 text-muted-foreground";
  return <Badge variant="outline" className={cn("rounded-sm text-[9px] font-bold tracking-widest uppercase", tone)}>{status}</Badge>;
}

function LabPage() {
  const queryClient = useQueryClient();
  const overviewFn = useServerFn(getLabOverview);
  const runFn = useServerFn(getEvaluationRun);
  const createFn = useServerFn(createEvaluationRunFn);
  const batchFn = useServerFn(processEvaluationBatchFn);
  const statusFn = useServerFn(setEvaluationRunStatusFn);
  const workspaceFn = useServerFn(getWorkspace);

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [label, setLabel] = useState("Agentic vs storefront");
  const [sampleSize, setSampleSize] = useState(24);
  const [batchSize, setBatchSize] = useState(8);
  const autoRunRef = useRef(false);

  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => workspaceFn({}) });
  const overview = useQuery({ queryKey: ["lab", "overview"], queryFn: () => overviewFn({}) });

  const runs = overview.data?.runs ?? [];
  const activeRunId = selectedRunId ?? runs[0]?.id ?? null;

  const detail = useQuery({
    queryKey: ["lab", "run", activeRunId],
    queryFn: () => runFn({ data: { run_id: activeRunId! } }),
    enabled: Boolean(activeRunId),
    refetchInterval: autoRun ? 4000 : false,
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: { label, sample_size: sampleSize, batch_size: batchSize, include_safety: true },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSelectedRunId(result.run_id);
      setAutoRun(true);
      autoRunRef.current = true;
      await queryClient.invalidateQueries({ queryKey: ["lab"] });
      toast.success(`Run created · ${result.sample_size} scenarios × 2 arms`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create the run."),
  });

  const batch = useMutation({
    mutationFn: (runId: string) => batchFn({ data: { run_id: runId } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["lab"] });
      if (!result.ok) {
        toast.error(result.error);
        setAutoRun(false);
        autoRunRef.current = false;
        return;
      }
      if (result.status === "paused") {
        setAutoRun(false);
        autoRunRef.current = false;
        toast.warning(result.paused_reason ?? "Run paused.");
        return;
      }
      if (result.status === "completed") {
        setAutoRun(false);
        autoRunRef.current = false;
        toast.success("Evaluation run complete.");
      }
    },
    onError: (error) => {
      setAutoRun(false);
      autoRunRef.current = false;
      toast.error(error instanceof Error ? error.message : "Batch failed.");
    },
  });

  const status = useMutation({
    mutationFn: (input: { runId: string; status: "queued" | "paused" | "cancelled" }) =>
      statusFn({ data: { run_id: input.runId, status: input.status } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["lab"] });
    },
  });

  useEffect(() => {
    autoRunRef.current = autoRun;
  }, [autoRun]);

  useEffect(() => {
    if (!autoRun || !activeRunId) return;
    if (batch.isPending) return;
    const run = detail.data?.run;
    if (run && (run.status === "paused" || run.status === "cancelled")) {
      setAutoRun(false);
      return;
    }
    if (run && run.pending_results === 0 && run.total_results > 0) {
      setAutoRun(false);
      return;
    }
    const timer = setTimeout(() => {
      if (autoRunRef.current) batch.mutate(activeRunId);
    }, 900);
    return () => clearTimeout(timer);
  }, [autoRun, activeRunId, batch.isPending, detail.data?.run?.pending_results, detail.data?.run?.status]);

  const metrics = detail.data?.metrics ?? null;
  const results = detail.data?.results ?? [];
  const run = detail.data?.run ?? null;
  const currency = workspace.data?.merchant?.currency ?? "INR";

  const scenarioRows = results.filter((r) => r.baseline_type !== "safety");
  const failures = scenarioRows
    .filter((r) => r.outcome_match === false || r.status === "failed")
    .sort((a, b) => a.baseline_type.localeCompare(b.baseline_type));
  const agenticFailures = failures.filter((r) => r.baseline_type === "agentic");

  const progress = run && run.total_results > 0 ? ((run.total_results - run.pending_results) / run.total_results) * 100 : 0;

  return (
    <AppShell 
      title="Evaluation Lab" 
      subtitle="Benchmark agentic mechanisms against traditional commerce patterns on identical buyer intent."
      accountLabel={workspace.data?.profile.email ?? undefined}
    >
      <div className="flex items-center justify-between border-b border-border/40 pb-6 mb-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground uppercase">Evaluation Lab</h2>
          <p className="text-xs text-muted-foreground mt-1">"Benchmark agentic mechanisms against traditional commerce patterns on identical buyer intent."</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold tracking-widest text-emerald-500 uppercase">EVALUATION ENGINE READY</span>
        </div>
      </div>

      <div className="space-y-8">
        {/* Methodology Panel */}
        <div className="grid gap-4 md:grid-cols-3 bg-muted/20 border border-border p-6 rounded-sm">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground">ISOLATING VARIABLES</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">Both arms execute against identical buyer profiles, catalog data, and merchant policies.</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground">BASELINE PARITY</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">The control arm implements standard storefront logic, lacking negotiation agency.</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground">DETERMINISTIC SIGNAL</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">Scenarios are seeded for reproducible outcomes, not stochastic projections.</p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-6">
            <div className="rounded-sm border border-border bg-card shadow-none">
              <div className="bg-muted/30 border-b border-border px-6 py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Create Evaluation Run</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dataset</Label>
                  <div className="px-3 py-2 bg-muted/30 border border-border rounded-sm text-xs font-mono">{overview.data?.dataset.version ?? "technova-eval-v1"}</div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="run-label" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Run Label</Label>
                  <Input 
                    id="run-label" 
                    className="rounded-sm border-border bg-background focus-visible:ring-primary/20 h-9 text-sm"
                    value={label} 
                    onChange={(event) => setLabel(event.target.value)} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sample" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Scenarios</Label>
                    <Input id="sample" type="number" value={sampleSize ?? 0} onChange={(e) => setSampleSize(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="batch" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Batch Size</Label>
                    <Input id="batch" type="number" value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed italic">"Each scenario runs twice: storefront + agent, plus deterministic safety probes."</p>
                <Button className="w-full rounded-sm font-bold uppercase tracking-[0.2em]" onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
                  CREATE AND START RUN
                </Button>
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            {run ? (
              <div className="rounded-sm border border-border bg-card p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-3">
                      {run.label} <StatusBadge status={run.status} />
                    </h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {[{l:"Model", v:run.model}, {l:"Prompt", v:run.prompt_version}, {l:"Dataset", v:run.dataset_version}, {l:"Policy", v:run.policy_version}, {l:"Catalog", v:run.catalog_version}].map(c => (
                        <div key={c.l} className="flex gap-1.5 items-center px-2 py-0.5 border border-border rounded-sm bg-muted/20">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase">{c.l}</span>
                          <span className="text-[10px] font-mono text-foreground">{c.v ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <Progress value={progress} className="h-2 rounded-sm" />
                <p className="text-[10px] font-mono text-muted-foreground mt-2">{run.completed_results} / {run.total_results} measurements complete</p>
              </div>
            ) : null}

            {metrics ? (
              <Tabs defaultValue="impact">
                <TabsList className="bg-transparent border-b border-border p-0 h-auto">
                  <TabsTrigger value="impact" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary px-6 py-3">Merchant impact</TabsTrigger>
                  <TabsTrigger value="ab" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary px-6 py-3">A/B detail</TabsTrigger>
                  <TabsTrigger value="safety" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary px-6 py-3">Safety</TabsTrigger>
                  <TabsTrigger value="failures" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary px-6 py-3">Where it failed</TabsTrigger>
                  <TabsTrigger value="rows" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary px-6 py-3">Scenario rows</TabsTrigger>
                </TabsList>

                <TabsContent value="impact" className="space-y-6 pt-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="rounded-sm border border-border bg-card p-5">
                       <p className="text-[10px] font-bold text-muted-foreground uppercase mb-4">TRADITIONAL STOREFRONT</p>
                       <div className="text-3xl font-mono mb-6">{money(metrics.traditional.revenue + metrics.traditional.cross_sell_revenue)}</div>
                       <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                          <div><p className="text-muted-foreground">Conversion</p>{pct(metrics.traditional.conversion_rate)}</div>
                          <div><p className="text-muted-foreground">AOV</p>{money(metrics.traditional.aov)}</div>
                       </div>
                    </div>
                    <div className="rounded-sm border border-blue-500/20 bg-blue-500/5 p-5">
                       <p className="text-[10px] font-bold text-blue-500 uppercase mb-4">AGENTIC COMMERCE</p>
                       <div className="text-3xl font-mono mb-6">{money(metrics.agentic.revenue + metrics.agentic.cross_sell_revenue)}</div>
                       <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                          <div><p className="text-muted-foreground">Conversion</p>{pct(metrics.agentic.conversion_rate)}</div>
                          <div><p className="text-muted-foreground">AOV</p>{money(metrics.agentic.aov)}</div>
                       </div>
                    </div>
                  </div>

                  <div className="rounded-sm border border-border p-6">
                    <h4 className="text-xs font-bold uppercase mb-4">Merchant Impact Evidence</h4>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                       {[
                         {l: "Conversion delta", v: signed(metrics.lift.conversion_rate_pp, "pp")},
                         {l: "Revenue/session delta", v: signed(metrics.lift.revenue_per_session_pct, "%")},
                         {l: "Discount impact", v: signed(metrics.lift.discount_rate_pp, "pp")},
                         {l: "Measured revenue delta", v: money(metrics.lift.revenue_delta)}
                       ].map((m, i) => (
                         <div key={i}>
                           <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{m.l}</p>
                           <p className={cn("text-lg font-mono font-medium", i !== 2 ? "text-emerald-500" : "text-muted-foreground")}>{m.v}</p>
                         </div>
                       ))}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            ) : null}
            
            <div className="rounded-sm border border-blue-500/20 bg-blue-500/5 p-4 flex gap-3 items-center">
              <Shield className="size-4 text-blue-500" />
              <div>
                <p className="text-[10px] font-bold uppercase text-blue-500">SERVER-SOURCED EVIDENCE</p>
                <p className="text-[10px] text-muted-foreground">Evaluation results are read from persisted server-side orders, quotes and measurements.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
