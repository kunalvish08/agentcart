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
  Shield,
  Zap,
  Microscope,
  Fingerprint
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";


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
            <div className="rounded-sm border border-border bg-card shadow-none mt-6">
              <div className="bg-muted/30 border-b border-border px-6 py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recent runs</p>
              </div>
              <div className="p-0">
                {runs.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-[11px] text-muted-foreground italic">No runs yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Run</th>
                          <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Status</th>
                          <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground text-right">Results</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {runs.map((item: RunSummary) => (
                          <tr 
                            key={item.id} 
                            onClick={() => {
                              setSelectedRunId(item.id);
                              setAutoRun(false);
                            }}
                            className={cn(
                              "cursor-pointer hover:bg-muted/30 transition-colors",
                              item.id === activeRunId ? "bg-primary/5" : ""
                            )}
                          >
                            <td className="px-4 py-3">
                              <p className="text-[10px] font-bold text-foreground truncate max-w-[120px]">{item.label}</p>
                              <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(item.created_at).toLocaleDateString()}</p>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={item.status} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-[10px] font-mono text-muted-foreground">{item.completed_results}/{item.total_results}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
              <Tabs defaultValue="impact" className="w-full">
                <TabsList className="bg-transparent border-b border-border p-0 h-auto w-full justify-start rounded-none">
                  <TabsTrigger value="impact" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3 text-[10px] font-bold uppercase tracking-widest">Merchant impact</TabsTrigger>
                  <TabsTrigger value="ab" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3 text-[10px] font-bold uppercase tracking-widest">A/B detail</TabsTrigger>
                  <TabsTrigger value="safety" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3 text-[10px] font-bold uppercase tracking-widest">Safety</TabsTrigger>
                  <TabsTrigger value="failures" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3 text-[10px] font-bold uppercase tracking-widest">Where it failed</TabsTrigger>
                  <TabsTrigger value="rows" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3 text-[10px] font-bold uppercase tracking-widest">Scenario rows</TabsTrigger>
                </TabsList>


                <TabsContent value="impact" className="space-y-6 pt-6">
                  {/* Revenue / Conversion lift section */}
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Control Arm */}
                    <div className="rounded-sm border border-border bg-card p-6">
                       <div className="flex items-center gap-2 mb-4">
                         <div className="size-2 rounded-full bg-slate-400" />
                         <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">TRADITIONAL STOREFRONT</p>
                       </div>
                       <div className="space-y-6">
                         <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Total measured revenue</p>
                            <div className="text-3xl font-mono text-foreground">{money(metrics.traditional.revenue + metrics.traditional.cross_sell_revenue)}</div>
                         </div>
                         <div className="grid grid-cols-2 gap-6 pt-6 border-t border-border/40">
                            <div>
                               <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Conversion</p>
                               <div className="text-xl font-mono text-foreground">{pct(metrics.traditional.conversion_rate)}</div>
                            </div>
                            <div>
                               <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">AOV</p>
                               <div className="text-xl font-mono text-foreground">{money(metrics.traditional.aov)}</div>
                            </div>
                         </div>
                       </div>
                    </div>

                    {/* Variant Arm */}
                    <div className="rounded-sm border border-blue-500/20 bg-blue-500/5 p-6 relative overflow-hidden">
                       <div className="absolute top-0 right-0 p-3 opacity-10">
                          <TrendingUp className="size-24 text-blue-500" />
                       </div>
                       <div className="flex items-center gap-2 mb-4">
                         <div className="size-2 rounded-full bg-blue-500 animate-pulse" />
                         <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">AGENTIC COMMERCE</p>
                       </div>
                       <div className="space-y-6">
                         <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-blue-500/60">Total measured revenue</p>
                            <div className="text-3xl font-mono text-foreground">{money(metrics.agentic.revenue + metrics.agentic.cross_sell_revenue)}</div>
                         </div>
                         <div className="grid grid-cols-2 gap-6 pt-6 border-t border-blue-500/20">
                            <div>
                               <p className="text-[9px] font-bold uppercase tracking-widest text-blue-500/60">Conversion</p>
                               <div className="text-xl font-mono text-foreground">{pct(metrics.agentic.conversion_rate)}</div>
                            </div>
                            <div>
                               <p className="text-[9px] font-bold uppercase tracking-widest text-blue-500/60">AOV</p>
                               <div className="text-xl font-mono text-foreground">{money(metrics.agentic.aov)}</div>
                            </div>
                         </div>
                       </div>
                    </div>
                  </div>

                  {/* Conversion lift viz bar */}
                  <div className="rounded-sm border border-border bg-card p-6">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Conversion Benchmark</p>
                      <div className="text-[11px] font-bold text-emerald-500 flex items-center gap-1">
                        {signed(metrics.lift.conversion_rate_pp, "pp")} <span className="text-[9px] font-normal uppercase opacity-60">improvement</span>
                      </div>
                    </div>
                    <div className="h-4 w-full bg-muted/40 rounded-full overflow-hidden flex">
                      <div 
                        className="h-full bg-slate-400/40" 
                        style={{ width: `${(metrics.traditional.conversion_rate / Math.max(metrics.traditional.conversion_rate, metrics.agentic.conversion_rate)) * 100}%` }} 
                      />
                      <div 
                        className="h-full bg-blue-500" 
                        style={{ width: `${((metrics.agentic.conversion_rate - metrics.traditional.conversion_rate) / Math.max(metrics.traditional.conversion_rate, metrics.agentic.conversion_rate)) * 100}%` }} 
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] font-mono text-muted-foreground">
                      <span>Storefront: {pct(metrics.traditional.conversion_rate)}</span>
                      <span>Agentic: {pct(metrics.agentic.conversion_rate)}</span>
                    </div>
                  </div>

                  {/* Merchant Impact Story */}
                  <div className="rounded-sm border border-border bg-card overflow-hidden">
                    <div className="bg-muted/30 border-b border-border px-6 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">The Merchant Story</p>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
                         {[
                           {l: "Conversion delta", v: signed(metrics.lift.conversion_rate_pp, "pp")},
                           {l: "Revenue/session delta", v: metrics.lift.revenue_per_session_pct !== null ? signed(metrics.lift.revenue_per_session_pct, "%") : "n/a"},
                           {l: "Discount impact", v: signed(metrics.lift.discount_rate_pp, "pp")},
                           {l: "Measured revenue delta", v: money(metrics.lift.revenue_delta)}
                         ].map((m, i) => (
                           <div key={i} className="space-y-1">
                             <p className="text-[9px] text-muted-foreground uppercase tracking-widest">{m.l}</p>
                             <p className={cn("text-lg font-mono font-medium", i !== 2 && !m.v.includes("-") ? "text-emerald-500" : "text-foreground")}>{m.v}</p>
                           </div>
                         ))}
                      </div>
                      <div className="space-y-3 text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-6 italic">
                        <p>
                          Agentic commerce converted <span className="text-foreground font-bold">{pct(metrics.agentic.conversion_rate)}</span> of sessions against <span className="text-foreground font-bold">{pct(metrics.traditional.conversion_rate)}</span> on the storefront.
                        </p>
                        <p>
                          Total measured revenue delta across this run: <span className="text-emerald-500 font-bold font-mono">{money(metrics.lift.revenue_delta, currency)}</span>.
                        </p>
                        <p>
                          All amounts are sourced from the server's authoritative order and quote records, ensuring data integrity across the evaluation lifecycle.
                        </p>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="ab" className="pt-6">
                  <div className="rounded-sm border border-border bg-card">
                    <div className="bg-muted/30 border-b border-border px-6 py-4 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Controlled Comparison</p>
                      <p className="text-[10px] text-muted-foreground italic">Storefront (control) vs agent (variant) · delta on the right</p>
                    </div>
                    <div className="p-6">
                      <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-3 border-b border-border pb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                        <span>Metric</span>
                        <span>Storefront</span>
                        <span>Agent</span>
                        <span className="justify-self-end">Δ</span>
                      </div>
                      <div className="divide-y divide-border/40">
                        <MetricRow
                          label="Conversion rate"
                          traditional={pct(metrics.traditional.conversion_rate)}
                          agentic={pct(metrics.agentic.conversion_rate)}
                          delta={<DeltaBadge value={metrics.lift.conversion_rate_pp} />}
                        />
                        <MetricRow
                          label="Average order value"
                          traditional={money(metrics.traditional.aov, currency)}
                          agentic={money(metrics.agentic.aov, currency)}
                          delta={<DeltaBadge value={metrics.lift.aov_pct} suffix="%" />}
                        />
                        <MetricRow
                          label="Revenue per session"
                          traditional={money(metrics.traditional.revenue_per_session, currency)}
                          agentic={money(metrics.agentic.revenue_per_session, currency)}
                          delta={<DeltaBadge value={metrics.lift.revenue_per_session_pct} suffix="%" />}
                        />
                        <MetricRow
                          label="Cross-sell attach rate"
                          hint="An eligible accessory quoted alongside the primary product"
                          traditional={pct(metrics.traditional.cross_sell_rate)}
                          agentic={pct(metrics.agentic.cross_sell_rate)}
                          delta={<DeltaBadge value={metrics.lift.cross_sell_rate_pp} />}
                        />
                        <MetricRow
                          label="Discount rate"
                          hint="Discount as a share of gross; lower is better for the merchant"
                          traditional={pct(metrics.traditional.discount_rate)}
                          agentic={pct(metrics.agentic.discount_rate)}
                          delta={<DeltaBadge value={metrics.lift.discount_rate_pp} />}
                        />
                        <MetricRow
                          label="Median session latency"
                          traditional={
                            metrics.traditional.avg_latency_ms
                              ? `${(metrics.traditional.avg_latency_ms / 1000).toFixed(1)}s`
                              : "—"
                          }
                          agentic={
                            metrics.agentic.avg_latency_ms
                              ? `${(metrics.agentic.avg_latency_ms / 1000).toFixed(1)}s`
                              : "—"
                          }
                        />
                        <MetricRow
                          label="API calls per session"
                          traditional={metrics.traditional.avg_tool_calls.toFixed(1)}
                          agentic={metrics.agentic.avg_tool_calls.toFixed(1)}
                        />
                      </div>

                      <div className="mt-6 rounded-sm border border-blue-500/20 bg-blue-500/5 p-4 flex gap-3 items-center">
                        <Gauge className="size-3.5 text-blue-500" />
                        <div className="text-[10px] text-blue-500/70">
                          {metrics.ai_cost.note} Measured usage for this run:{" "}
                          <span className="font-mono font-bold text-blue-500">{metrics.ai_cost.prompt_tokens.toLocaleString("en-IN")}</span> prompt +{" "}
                          <span className="font-mono font-bold text-blue-500">{metrics.ai_cost.completion_tokens.toLocaleString("en-IN")}</span> completion tokens.
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="safety" className="pt-6">
                  <div className="rounded-sm border border-border bg-card">
                    <div className="bg-muted/30 border-b border-border px-6 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Deterministic Safety Probes</p>
                    </div>
                    <div className="p-6 space-y-4">
                      <p className="text-[11px] text-muted-foreground">
                        {metrics.safety.passed} / {metrics.safety.total} contained · these are live calls against the public API, not assertions about it
                      </p>
                      
                      <div className="space-y-2">
                        {metrics.safety.probes.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground italic">No safety probes recorded for this run yet.</p>
                        ) : (
                          metrics.safety.probes.map((probe) => (
                            <div key={probe.id} className="flex items-center justify-between p-3 border border-border rounded-sm bg-muted/10">
                              <div>
                                <p className="text-[11px] font-bold text-foreground">{probe.title}</p>
                                <p className="text-[10px] text-muted-foreground">{probe.evidence}</p>
                              </div>
                              <Badge variant="outline" className={cn("text-[9px] font-bold uppercase tracking-widest rounded-sm", probe.passed ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/5" : "text-destructive border-destructive/20 bg-destructive/5")}>
                                {probe.passed ? "contained" : "FAILED"}
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>
                      
                      <p className="text-[10px] text-muted-foreground border-t border-border pt-4">
                        Policy containment across scenario rows: storefront{" "}
                        <span className="font-mono text-foreground">{pct(metrics.traditional.safely_contained_rate)}</span> · agent{" "}
                        <span className="font-mono text-foreground">{pct(metrics.agentic.safely_contained_rate)}</span>.
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="failures" className="pt-6">
                  <div className="rounded-sm border border-border bg-card">
                    <div className="bg-muted/30 border-b border-border px-6 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Where the Agent Failed</p>
                    </div>
                    <div className="p-6 space-y-4">
                      <p className="text-[11px] text-muted-foreground">
                        {agenticFailures.length} agent rows missed their expected outcome in this run. Nothing here is filtered.
                      </p>
                      
                      <div className="space-y-3">
                        {failures.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground italic">No mismatches recorded yet for the completed rows.</p>
                        ) : (
                          failures.slice(0, 40).map((row) => (
                            <div key={`${row.scenario_id}-${row.baseline_type}`} className="p-3 border border-border rounded-sm bg-muted/10">
                              <div className="flex flex-wrap items-center gap-3 mb-2">
                                <Badge variant="outline" className="rounded-sm text-[9px] uppercase tracking-widest">{row.baseline_type}</Badge>
                                <span className="font-mono text-[10px] text-muted-foreground">{row.scenario_id}</span>
                                <Badge variant="outline" className="rounded-sm text-[9px] uppercase tracking-widest">
                                  {OUTCOME_LABELS[row.expected_outcome as keyof typeof OUTCOME_LABELS] ?? row.expected_outcome}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">→</span>
                                <span className="text-[10px] font-bold text-foreground">{row.actual_outcome ?? "—"}</span>
                              </div>
                              {row.intent ? <p className="text-[11px] text-foreground mb-1">{row.intent}</p> : null}
                              {row.failure_reason ? <p className="text-[10px] text-destructive/80 italic">{row.failure_reason}</p> : null}
                              {row.agent_run_id ? (
                                <Link to="/judge" className="mt-2 flex items-center gap-1 text-[10px] text-blue-500 hover:underline">
                                  Replay in Judge Mode <ChevronRight className="size-2.5" />
                                </Link>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="rows" className="pt-6">
                  <div className="rounded-sm border border-border bg-card">
                    <div className="bg-muted/30 border-b border-border px-6 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Scenario-level results</p>
                    </div>
                    <div className="p-0">
                      <div className="max-h-[520px] overflow-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10 border-b border-border">
                            <tr>
                              <th className="px-6 py-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Scenario</th>
                              <th className="px-6 py-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Arm</th>
                              <th className="px-6 py-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground text-right">Final</th>
                              <th className="px-6 py-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Outcome</th>
                              <th className="px-6 py-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground text-right">Match</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40">
                            {scenarioRows.map((row: ResultRowView) => (
                              <tr key={`${row.scenario_id}-${row.baseline_type}`} className="hover:bg-muted/30 transition-colors">
                                <td className="px-6 py-3 font-mono text-[10px] text-foreground">{row.scenario_id}</td>
                                <td className="px-6 py-3 text-[10px] text-muted-foreground">{row.baseline_type}</td>
                                <td className="px-6 py-3 text-[10px] text-right font-mono text-foreground">{money(row.final_amount, currency)}</td>
                                <td className="px-6 py-3 text-[10px] text-muted-foreground">{row.actual_outcome ?? row.status}</td>
                                <td className="px-6 py-3 text-right">
                                  {row.outcome_match === null ? "—" : row.outcome_match ? 
                                    <span className="text-emerald-500">✓</span> : 
                                    <span className="text-destructive">✗</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

            ) : null}

            {/* Authority / Data Integrity */}
            <div className="rounded-sm border border-blue-500/20 bg-blue-500/5 p-4 flex gap-3 items-center">
              <Shield className="size-4 text-blue-500 flex-shrink-0" />
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

