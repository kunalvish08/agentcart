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
  Store,
  TrendingUp,
} from "lucide-react";

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

export const Route = createFileRoute("/_authenticated/lab")({
  head: () => ({
    meta: [
      { title: "Evaluation Lab · Does agentic commerce actually earn more?" },
      {
        name: "description",
        content:
          "A reproducible A/B experiment: the same synthetic buyers shop a traditional storefront and an AI agent through the same public API and the same merchant policy, measured on conversion, order value, safety and honest failures.",
      },
      { property: "og:title", content: "Evaluation Lab · Agentic commerce vs a traditional storefront" },
      {
        property: "og:description",
        content:
          "Reproducible synthetic-buyer evaluation with revenue lift, safety containment and a published failure list.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
      ? "border-verified-green/40 bg-verified-green/10 text-verified-green"
      : value < -0.05
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-muted bg-muted/40 text-muted-foreground";
  return <Badge className={cn("rounded-sm font-bold", tone)} variant="outline">{signed(value, suffix)}</Badge>;
}

function MetricRow({
  label,
  traditional,
  agentic,
  delta,
  hint,
}: {
  label: string;
  traditional: string;
  agentic: string;
  delta?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <p className="text-sm tabular-nums text-muted-foreground">{traditional}</p>
      <p className="text-sm font-semibold tabular-nums">{agentic}</p>
      <div className="justify-self-end">{delta}</div>
    </div>
  );
}

function ArmCard({ title, icon, metrics, tone }: { title: string; icon: React.ReactNode; metrics: ArmMetrics; tone: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className={`flex size-7 items-center justify-center rounded-md ${tone}`}>{icon}</span>
          {title}
        </CardTitle>
        <CardDescription>
          {metrics.sessions} sessions · {metrics.conversions} orders
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Conversion</span>
          <span className="font-medium tabular-nums">{pct(metrics.conversion_rate)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Revenue</span>
          <span className="font-medium tabular-nums">{money(metrics.revenue + metrics.cross_sell_revenue)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Revenue / session</span>
          <span className="font-medium tabular-nums">{money(metrics.revenue_per_session)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">AOV</span>
          <span className="font-medium tabular-nums">{money(metrics.aov)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Median latency</span>
          <span className="font-medium tabular-nums">
            {metrics.avg_latency_ms ? `${(metrics.avg_latency_ms / 1000).toFixed(1)}s` : "—"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : status === "running"
        ? "border-primary/40 bg-primary/10 text-primary"
        : status === "paused"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : status === "failed" || status === "cancelled"
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-muted bg-muted/40 text-muted-foreground";
  return (
    <Badge variant="outline" className={tone}>
      {status}
    </Badge>
  );
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

  // Auto-advance: one chunk at a time, never overlapping, stops on pause/finish.
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
        <h2 className="text-xl font-bold tracking-tight text-foreground uppercase">Experiment Console</h2>
      </div>

      <div className="space-y-8">
        <Card className="rounded-sm border-primary/20 bg-primary/[0.02] shadow-none overflow-hidden">
          <CardHeader className="bg-primary/[0.05] border-b border-primary/10 pb-4">
            <CardTitle className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary/80">
              <Beaker className="size-3.5" />
              Experiment Methodology
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-8 pt-6 pb-8 text-xs md:grid-cols-3">
            <div>
              <p className="font-bold uppercase tracking-tight text-foreground mb-1.5">Isolating Variables</p>
              <p className="text-muted-foreground leading-relaxed">
                Both arms execute against identical buyer profiles, catalog data, and merchant policies. The only variable is the commerce engine.
              </p>
            </div>
            <div>
              <p className="font-bold uppercase tracking-tight text-foreground mb-1.5">Baseline Parity</p>
              <p className="text-muted-foreground leading-relaxed">
                The control arm implements standard storefront logic: budget matching, stock checking, and upsell rules. It lacks negotiation agency.
              </p>
            </div>
            <div>
              <p className="font-bold uppercase tracking-tight text-foreground mb-1.5">Deterministic Signal</p>
              <p className="text-muted-foreground leading-relaxed">
                Scenarios are seeded to ensure reproducible results. Outcomes provide mechanism evidence, not stochastic projections.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-6">
            <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border pb-4">
                <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">New Evaluation</CardTitle>
                <CardDescription className="text-xs">
                  Dataset {overview.data?.dataset.version ?? "…"} · {overview.data?.dataset.total ?? 0} scenarios
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
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
                  <Label htmlFor="sample">Scenarios</Label>
                  <Input
                    id="sample"
                    type="number"
                    min={1}
                    max={overview.data?.dataset.total ?? 120}
                    value={sampleSize}
                    onChange={(event) => setSampleSize(Number(event.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="batch">Batch size</Label>
                  <Input
                    id="batch"
                    type="number"
                    min={1}
                    max={25}
                    value={batchSize}
                    onChange={(event) => setBatchSize(Number(event.target.value))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Each scenario runs twice (storefront + agent) plus 6 deterministic safety probes. Work is processed in
                bounded batches with a database lease, so it is safe to leave and come back.
              </p>
              <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
                Create and start run
              </Button>

              <Separator />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent runs</p>
              <div className="space-y-2">
                {runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No runs yet.</p>
                ) : (
                  runs.map((item: RunSummary) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedRunId(item.id);
                        setAutoRun(false);
                      }}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                        item.id === activeRunId ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{item.label}</span>
                        <StatusBadge status={item.status} />
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {item.completed_results}/{item.total_results} results ·{" "}
                        {new Date(item.created_at).toLocaleString("en-IN")}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {run ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        {run.label} <StatusBadge status={run.status} />
                      </CardTitle>
                      <CardDescription>
                        {run.model} · prompt {run.prompt_version} · dataset {run.dataset_version} · policy{" "}
                        {run.policy_version ?? "—"} · catalog {run.catalog_version ?? "—"}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {run.pending_results > 0 ? (
                        autoRun ? (
                          <Button variant="outline" size="sm" onClick={() => setAutoRun(false)}>
                            <Pause className="mr-2 size-4" /> Pause batching
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={async () => {
                              if (run.status === "paused") {
                                await status.mutateAsync({ runId: run.id, status: "queued" });
                              }
                              setAutoRun(true);
                            }}
                            disabled={batch.isPending}
                          >
                            {batch.isPending ? (
                              <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : (
                              <Play className="mr-2 size-4" />
                            )}
                            {run.status === "paused" ? "Resume run" : "Run next batches"}
                          </Button>
                        )
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-xs text-muted-foreground">
                    {run.completed_results} of {run.total_results} measurements complete
                    {run.pending_results > 0 ? ` · ${run.pending_results} queued` : ""}
                    {batch.isPending ? " · batch in flight" : ""}
                  </p>
                  {run.paused_reason ? (
                    <p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-4" /> {run.paused_reason}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Create a run to measure agentic commerce against the storefront baseline.
                </CardContent>
              </Card>
            )}

            </aside>

            <div className="space-y-6">
              {metrics ? (
              <Tabs defaultValue="impact">
                <TabsList>
                  <TabsTrigger value="impact">Merchant impact</TabsTrigger>
                  <TabsTrigger value="ab">A/B detail</TabsTrigger>
                  <TabsTrigger value="safety">Safety</TabsTrigger>
                  <TabsTrigger value="failures">Where it failed</TabsTrigger>
                  <TabsTrigger value="rows">Scenario rows</TabsTrigger>
                </TabsList>

                <TabsContent value="impact" className="space-y-4 pt-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <ArmCard
                      title="Traditional storefront"
                      icon={<Store className="size-4" />}
                      metrics={metrics.traditional}
                      tone="bg-muted text-muted-foreground"
                    />
                    <ArmCard
                      title="Agentic commerce"
                      icon={<TrendingUp className="size-4" />}
                      metrics={metrics.agentic}
                      tone="bg-primary/10 text-primary"
                    />
                  </div>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <CircleDollarSign className="size-4" /> The merchant story
                      </CardTitle>
                      <CardDescription>
                        Same {metrics.traditional.sessions} buyers, both arms, identical policy.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p>
                        Agentic commerce converted{" "}
                        <strong>{pct(metrics.agentic.conversion_rate)}</strong> of sessions against{" "}
                        <strong>{pct(metrics.traditional.conversion_rate)}</strong> on the storefront (
                        {signed(metrics.lift.conversion_rate_pp, "pp")}), and produced{" "}
                        <strong>{money(metrics.agentic.revenue_per_session, currency)}</strong> per session against{" "}
                        <strong>{money(metrics.traditional.revenue_per_session, currency)}</strong>
                        {metrics.lift.revenue_per_session_pct === null
                          ? ""
                          : ` (${signed(metrics.lift.revenue_per_session_pct, "%")})`}
                        .
                      </p>
                      <p>
                        Discount given away: <strong>{pct(metrics.agentic.discount_rate)}</strong> of gross for the
                        agent versus <strong>{pct(metrics.traditional.discount_rate)}</strong> for the storefront, and
                        every discount stayed inside the merchant's policy cap.
                      </p>
                      <p className="text-muted-foreground">
                        Total measured revenue delta across this run:{" "}
                        <strong className="text-foreground">{money(metrics.lift.revenue_delta, currency)}</strong>. All
                        amounts are the server's own numbers, read back from persisted orders and quotes.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="ab" className="pt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart3 className="size-4" /> Controlled comparison
                      </CardTitle>
                      <CardDescription>Storefront (control) vs agent (variant) · delta on the right</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-3 border-b pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <span>Metric</span>
                        <span>Storefront</span>
                        <span>Agent</span>
                        <span className="justify-self-end">Δ</span>
                      </div>
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
                        label="Expected-outcome match"
                        traditional={pct(metrics.traditional.outcome_match_rate)}
                        agentic={pct(metrics.agentic.outcome_match_rate)}
                        delta={
                          <DeltaBadge
                            value={metrics.agentic.outcome_match_rate - metrics.traditional.outcome_match_rate}
                          />
                        }
                      />
                      <MetricRow
                        label="Unsupported-number rate"
                        hint="Agent stated a money figure no tool result returned"
                        traditional={pct(metrics.traditional.hallucination_rate)}
                        agentic={pct(metrics.agentic.hallucination_rate)}
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

                      <div className="mt-4 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                        <p className="flex items-center gap-2 font-medium text-foreground">
                          <Gauge className="size-3.5" /> AI cost
                        </p>
                        <p className="mt-1">
                          {metrics.ai_cost.note} Measured usage for this run:{" "}
                          {metrics.ai_cost.prompt_tokens.toLocaleString("en-IN")} prompt +{" "}
                          {metrics.ai_cost.completion_tokens.toLocaleString("en-IN")} completion tokens.
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {metrics.by_category.length > 0 ? (
                    <Card className="mt-4">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">By buyer type</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                              <tr className="border-b">
                                <th className="py-2 text-left font-medium">Scenario type</th>
                                <th className="py-2 text-right font-medium">n</th>
                                <th className="py-2 text-right font-medium">Storefront orders</th>
                                <th className="py-2 text-right font-medium">Agent orders</th>
                                <th className="py-2 text-right font-medium">Storefront revenue</th>
                                <th className="py-2 text-right font-medium">Agent revenue</th>
                              </tr>
                            </thead>
                            <tbody>
                              {metrics.by_category.map((row) => (
                                <tr key={row.category} className="border-b border-border/60 last:border-0">
                                  <td className="py-2">
                                    {CATEGORY_LABELS[row.category as keyof typeof CATEGORY_LABELS] ?? row.category}
                                  </td>
                                  <td className="py-2 text-right tabular-nums">{row.scenarios}</td>
                                  <td className="py-2 text-right tabular-nums">{row.traditional_conversions}</td>
                                  <td className="py-2 text-right tabular-nums">{row.agentic_conversions}</td>
                                  <td className="py-2 text-right tabular-nums">
                                    {money(row.traditional_revenue, currency)}
                                  </td>
                                  <td className="py-2 text-right tabular-nums">{money(row.agentic_revenue, currency)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </TabsContent>

                <TabsContent value="safety" className="pt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ShieldCheck className="size-4" /> Deterministic safety probes
                      </CardTitle>
                      <CardDescription>
                        {metrics.safety.passed}/{metrics.safety.total} contained · these are live calls against the
                        public API, not assertions about it
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {metrics.safety.probes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No safety probes recorded for this run yet.</p>
                      ) : (
                        metrics.safety.probes.map((probe) => (
                          <div
                            key={probe.id}
                            className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium">{probe.title}</p>
                              <p className="text-xs text-muted-foreground">{probe.evidence}</p>
                            </div>
                            <Badge
                              variant="outline"
                              className={
                                probe.passed
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "border-destructive/40 bg-destructive/10 text-destructive"
                              }
                            >
                              {probe.passed ? "contained" : "FAILED"}
                            </Badge>
                          </div>
                        ))
                      )}
                      <p className="pt-2 text-xs text-muted-foreground">
                        Policy containment across scenario rows: storefront{" "}
                        {pct(metrics.traditional.safely_contained_rate)} · agent{" "}
                        {pct(metrics.agentic.safely_contained_rate)}.
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="failures" className="pt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <AlertTriangle className="size-4 text-amber-500" /> Where the agent failed
                      </CardTitle>
                      <CardDescription>
                        {agenticFailures.length} agent rows missed their expected outcome in this run. Nothing here is
                        filtered.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {failures.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No mismatches recorded yet for the completed rows.
                        </p>
                      ) : (
                        failures.slice(0, 40).map((row) => (
                          <div key={`${row.scenario_id}-${row.baseline_type}`} className="rounded-md border px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{row.baseline_type}</Badge>
                              <span className="font-mono text-xs text-muted-foreground">{row.scenario_id}</span>
                              <Badge variant="outline">
                                {OUTCOME_LABELS[row.expected_outcome as keyof typeof OUTCOME_LABELS] ??
                                  row.expected_outcome}
                              </Badge>
                              <span className="text-xs text-muted-foreground">→ {row.actual_outcome ?? "—"}</span>
                            </div>
                            {row.intent ? <p className="mt-1 text-sm">{row.intent}</p> : null}
                            {row.failure_reason ? (
                              <p className="mt-1 text-xs text-muted-foreground">{row.failure_reason}</p>
                            ) : null}
                            {row.agent_run_id ? (
                              <Link
                                to="/judge"
                                className="mt-1 inline-block text-xs text-primary underline-offset-4 hover:underline"
                              >
                                Replay this run in Judge Mode
                              </Link>
                            ) : null}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="rows" className="pt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Database className="size-4" /> Scenario-level results
                      </CardTitle>
                      <CardDescription>{scenarioRows.length} measurements</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[520px] overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-background text-xs uppercase tracking-wide text-muted-foreground">
                            <tr className="border-b">
                              <th className="py-2 text-left font-medium">Scenario</th>
                              <th className="py-2 text-left font-medium">Arm</th>
                              <th className="py-2 text-left font-medium">Product</th>
                              <th className="py-2 text-right font-medium">Final</th>
                              <th className="py-2 text-left font-medium">Outcome</th>
                              <th className="py-2 text-right font-medium">Match</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scenarioRows.map((row: ResultRowView) => (
                              <tr key={`${row.scenario_id}-${row.baseline_type}`} className="border-b border-border/60">
                                <td className="py-2 font-mono text-xs">{row.scenario_id}</td>
                                <td className="py-2">{row.baseline_type}</td>
                                <td className="py-2">{row.selected_product ?? "—"}</td>
                                <td className="py-2 text-right tabular-nums">{money(row.final_amount, currency)}</td>
                                <td className="py-2 text-xs">{row.actual_outcome ?? row.status}</td>
                                <td className="py-2 text-right">
                                  {row.outcome_match === null ? "—" : row.outcome_match ? "✓" : "✗"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
