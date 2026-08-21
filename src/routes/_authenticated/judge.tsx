import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  BadgeCheck,
  Banknote,
  CircleSlash,
  FlaskConical,
  Gavel,
  Layers,
  Loader2,
  Play,
  Repeat,
  ShieldCheck,
  RefreshCcw,
  CheckCircle2,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ARCHITECTURE_LAYERS,
  CHAOS_SCENARIOS,
  MONEY_RULES,
  SECURITY_CONTROLS,
  type ChaosScenarioId,
} from "@/lib/judge-facts";
import {
  getJudgeEvidence,
  getJudgeReplay,
  getJudgeRuns,
  getMoneyAuthorityProof,
  runJudgeChaos,
  runJudgeDemoRun,
  performJudgeDemoReset,
} from "@/lib/judge.functions";
import type { ChaosResult, JudgeDemoResult, ResetResult } from "@/lib/judge.server";
import { getWorkspace } from "@/lib/merchant.functions";

export const Route = createFileRoute("/_authenticated/judge")({
  head: () => ({
    meta: [
      { title: "Judge Mode · Agentic Commerce control room" },
      {
        name: "description",
        content:
          "Engineering control room for one AI commerce transaction: deterministic demo run, execution trace, money-authority proof, chaos failure drills and security evidence.",
      },
      { property: "og:title", content: "Judge Mode · Agentic Commerce control room" },
      {
        property: "og:description",
        content:
          "Replayable traces, server-authoritative money proof and safe failure drills for an agentic commerce platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JudgePage,
});

const money = (amount: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    amount,
  );

function StatusDot({ status }: { status: string }) {
  const tone =
    status === "ok" || status === "protected" || status === "completed"
      ? "bg-emerald-500"
      : status === "blocked" || status === "unprotected" || status === "failed"
        ? "bg-destructive"
        : "bg-muted-foreground";
  return <span className={`mt-1.5 inline-block size-2 shrink-0 rounded-full ${tone}`} />;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

function JudgePage() {
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(getWorkspace);
  const fetchEvidence = useServerFn(getJudgeEvidence);
  const fetchMoney = useServerFn(getMoneyAuthorityProof);
  const fetchRuns = useServerFn(getJudgeRuns);
  const fetchReplay = useServerFn(getJudgeReplay);
  const demoFn = useServerFn(runJudgeDemoRun);
  const chaosFn = useServerFn(runJudgeChaos);
  const resetFn = useServerFn(performJudgeDemoReset);

  const [demo, setDemo] = useState<JudgeDemoResult | null>(null);
  const [chaos, setChaos] = useState<Record<string, ChaosResult>>({});
  const [replayId, setReplayId] = useState<string | null>(null);
  const [resetSummary, setResetSummary] = useState<ResetResult | null>(null);

  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => fetchWorkspace() });
  const evidence = useQuery({ queryKey: ["judge", "evidence"], queryFn: () => fetchEvidence() });
  const proof = useQuery({ queryKey: ["judge", "money"], queryFn: () => fetchMoney() });
  const runs = useQuery({ queryKey: ["judge", "runs"], queryFn: () => fetchRuns() });
  const replay = useQuery({
    queryKey: ["judge", "replay", replayId],
    queryFn: () => fetchReplay({ data: { runId: replayId! } }),
    enabled: Boolean(replayId),
  });

  const demoRun = useMutation({
    mutationFn: () => demoFn(),
    onSuccess: (result) => {
      setDemo(result);
      if (result.ok) toast.success("Demo transaction completed through the real server paths.");
      else toast.error(result.error?.message ?? "The demo run stopped early.");
      void queryClient.invalidateQueries({ queryKey: ["judge"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const chaosRun = useMutation({
    mutationFn: (scenario: ChaosScenarioId) => chaosFn({ data: { scenario } }),
    onSuccess: (result) => {
      setChaos((prev) => ({ ...prev, [result.id]: result }));
      if (result.status === "protected") toast.success("Failure injected — protection held.");
      else if (result.status === "skipped") toast.info(result.observed);
      else toast.error("Protection did NOT hold — see the drill output.");
      void queryClient.invalidateQueries({ queryKey: ["judge", "evidence"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const demoReset = useMutation({
    mutationFn: () => resetFn(),
    onSuccess: (result) => {
      setResetSummary(result);
      setDemo(null);
      setReplayId(null);
      toast.success("Judge demo state reset successfully.");
      void queryClient.invalidateQueries({ queryKey: ["judge"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const ev = evidence.data;

  return (
    <AppShell
      title="Judge Mode"
      subtitle="One AI commerce transaction, end to end — with proof that every money action is server-authoritative."
      accountLabel={workspace.data?.merchant?.name ?? undefined}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Agent runs"
            value={String(ev?.runs.total ?? 0)}
            hint={`${ev?.runs.completed ?? 0} completed · avg ${ev?.runs.avg_duration_ms ?? 0} ms`}
          />
          <Metric
            label="Policy caps applied"
            value={String(ev?.integrity.policy_capped_quotes ?? 0)}
            hint={`${ev?.negotiation.rounds ?? 0} negotiation rounds · ${ev?.negotiation.countered ?? 0} countered`}
          />
          <Metric
            label="Human approvals"
            value={String(ev?.checkout.approved ?? 0)}
            hint={`${ev?.checkout.approval_required ?? 0} orders required a human · ${ev?.checkout.rejected ?? 0} rejected`}
          />
          <Metric
            label="Webhooks rejected / deduped"
            value={`${ev?.webhooks.rejected ?? 0} / ${ev?.webhooks.duplicates ?? 0}`}
            hint={`${ev?.webhooks.total ?? 0} deliveries recorded`}
          />
        </div>

        <Tabs defaultValue="run" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="run">
              <Gavel className="mr-2 size-4" /> Demo run
            </TabsTrigger>
            <TabsTrigger value="money">
              <Banknote className="mr-2 size-4" /> Money authority
            </TabsTrigger>
            <TabsTrigger value="chaos">
              <FlaskConical className="mr-2 size-4" /> Chaos lab
            </TabsTrigger>
            <TabsTrigger value="replay">
              <Repeat className="mr-2 size-4" /> Replay
            </TabsTrigger>
            <TabsTrigger value="evidence">
              <Activity className="mr-2 size-4" /> Evidence
            </TabsTrigger>
            <TabsTrigger value="security">
              <ShieldCheck className="mr-2 size-4" /> Security
            </TabsTrigger>
          </TabsList>

          {/* ------------------------------ demo run ------------------------------ */}
          <TabsContent value="run" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gavel className="size-4" /> Deterministic end-to-end transaction
                </CardTitle>
                <CardDescription>
                  Discovery → negotiation → policy → checkout → human approval → Razorpay test order.
                  This runs the real production code paths, not a mock. The final card payment is
                  deliberately left to a human in Razorpay test checkout — nothing here can mark a
                  payment captured on its own.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => demoRun.mutate()} disabled={demoRun.isPending}>
                    {demoRun.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 size-4" />
                    )}
                    Run demo transaction
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" disabled={demoReset.isPending}>
                        {demoReset.isPending ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="mr-2 size-4" />
                        )}
                        Reset Judge Demo
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reset Judge Demo?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes only designated TechNova demo transaction data.
                          Evaluation history and merchant configuration are preserved.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => demoReset.mutate()}>Confirm Reset</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {resetSummary && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
                    <div className="flex items-center gap-2 font-medium text-emerald-600">
                      <CheckCircle2 className="size-4" />
                      Demo state reset at {new Intl.DateTimeFormat('en-IN', { timeStyle: 'medium' }).format(new Date(resetSummary.timestamp))}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-[10px] text-muted-foreground uppercase tracking-tight">
                      <div>Sessions removed: {resetSummary.counts.sessions}</div>
                      <div>Runs removed: {resetSummary.counts.runs}</div>
                      <div>Steps removed: {resetSummary.counts.steps}</div>
                      <div>Tool calls removed: {resetSummary.counts.tool_calls}</div>
                      <div>Negotiations removed: {resetSummary.counts.negotiations}</div>
                      <div>Orders removed: {resetSummary.counts.orders}</div>
                      <div>Payments/Webhooks: {resetSummary.counts.payments}/{resetSummary.counts.webhooks}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {resetSummary.preserved.map(item => (
                        <Badge key={item} variant="secondary" className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/20">
                          Preserved: {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {demo?.summary ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Metric label="List price" value={money(demo.summary.list_amount, demo.currency)} />
                    <Metric
                      label="Negotiated total"
                      value={money(demo.summary.negotiated_amount, demo.currency)}
                      hint={`${demo.summary.discount_percent}% granted · cap ${demo.summary.policy_cap_percent}%`}
                    />
                    <Metric
                      label="Order status"
                      value={demo.summary.order_status ?? "—"}
                      hint={demo.summary.approval_required ? "Human approval was required" : "Straight-through"}
                    />
                    <Metric
                      label="Run duration"
                      value={`${demo.summary.duration_ms} ms`}
                      hint={demo.summary.payment_next_action}
                    />
                  </div>
                ) : null}

                {demo ? (
                  <ol className="space-y-3">
                    {demo.steps.map((step) => (
                      <li
                        key={step.number}
                        className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3"
                      >
                        <StatusDot status={step.status} />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {step.number}. {step.title}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {step.phase}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              authority: {step.authority}
                            </Badge>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {step.latency_ms} ms
                            </span>
                          </div>
                          <p className="break-words font-mono text-xs text-muted-foreground">
                            in · {step.input_summary}
                          </p>
                          <p className="break-words text-sm text-foreground/90">
                            out · {step.output_summary}
                          </p>
                          {step.entity ? (
                            <p className="break-all font-mono text-xs text-muted-foreground">
                              {step.entity.label}: {step.entity.id}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No run yet. The trace will show every tool call, policy decision and database id.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="size-4" /> Where each decision is made
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {ARCHITECTURE_LAYERS.map((layer, index) => (
                  <div key={layer.layer} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-secondary text-xs font-medium text-secondary-foreground">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-foreground">{layer.layer}</p>
                      <p className="text-muted-foreground">{layer.detail}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------- money authority --------------------------- */}
          <TabsContent value="money" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="size-4" /> Money authority chain (live data)
                </CardTitle>
                <CardDescription>
                  Read top to bottom: policy → quote → order → approval gate → Razorpay amount →
                  settlement. Every value is recomputed from the database, not from this page.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {MONEY_RULES.map((rule) => (
                    <li key={rule} className="flex gap-2">
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      {rule}
                    </li>
                  ))}
                </ul>
                <Separator />
                {proof.data?.rows.length ? (
                  <div className="space-y-2">
                    {proof.data.rows.map((row) => (
                      <div key={row.stage} className="rounded-lg border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{row.stage}</p>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm tabular-nums text-foreground">
                              {row.value}
                            </span>
                            {row.matches === null ? null : (
                              <Badge variant={row.matches ? "secondary" : "destructive"}>
                                {row.matches ? "consistent" : "mismatch"}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.authority} — {row.note}
                        </p>
                      </div>
                    ))}
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      order: {proof.data.order_id}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No order yet — run the demo transaction to populate the chain.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* -------------------------------- chaos -------------------------------- */}
          <TabsContent value="chaos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="size-4" /> Chaos lab — safe failure injection
                </CardTitle>
                <CardDescription>
                  Each drill injects a real failure into the real code path and shows the guard that
                  stopped it. Drills can only produce refusals: no drill can approve an order, mark a
                  payment captured, or exceed a policy. Test mode only — no real money.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {CHAOS_SCENARIOS.map((scenario) => {
                  const result = chaos[scenario.id];
                  const pending = chaosRun.isPending && chaosRun.variables === scenario.id;
                  return (
                    <div key={scenario.id} className="rounded-lg border border-border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{scenario.label}</p>
                          <p className="text-sm text-muted-foreground">{scenario.injects}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Expected: {scenario.expected}
                          </p>
                          <p className="text-xs text-muted-foreground">Guard: {scenario.guard}</p>
                          <p className="text-xs text-muted-foreground">
                            Side effects: {scenario.side_effects}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {result ? (
                            <Badge
                              variant={
                                result.status === "protected"
                                  ? "secondary"
                                  : result.status === "skipped"
                                    ? "outline"
                                    : "destructive"
                              }
                            >
                              {result.status}
                            </Badge>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={chaosRun.isPending}
                            onClick={() => chaosRun.mutate(scenario.id)}
                          >
                            {pending ? (
                              <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : (
                              <CircleSlash className="mr-2 size-4" />
                            )}
                            Inject
                          </Button>
                        </div>
                      </div>

                      {result ? (
                        <div className="mt-3 space-y-1 rounded-md bg-muted/40 p-3">
                          <p className="font-mono text-xs text-muted-foreground">
                            injected · {result.injected}
                          </p>
                          <p className="text-sm text-foreground/90">observed · {result.observed}</p>
                          <p className="text-xs text-muted-foreground">
                            {result.latency_ms} ms ·{" "}
                            {Object.entries(result.evidence)
                              .map(([k, v]) => `${k}=${String(v)}`)
                              .join(" · ") || "no additional evidence"}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* -------------------------------- replay -------------------------------- */}
          <TabsContent value="replay" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Repeat className="size-4" /> Replay a persisted run (observation only)
                </CardTitle>
                <CardDescription>
                  Replay re-reads stored trace rows. It never re-executes a step, so it cannot create
                  quotes, orders or payments.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(runs.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No runs recorded for this account yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(runs.data ?? []).map((run) => (
                      <div
                        key={run.run_id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={run.run_type === "EXTERNAL_AI_BUYER" ? "default" : "secondary"}
                              className="font-mono text-[10px]"
                            >
                              {run.run_type}
                            </Badge>
                            <p className="text-sm font-medium text-foreground">
                              {run.title ?? "Agent run"}
                            </p>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            Actor: {run.actor} · {run.user_request ?? "—"}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {run.model} · {run.status} · {run.step_count} steps ·{" "}
                            {run.tool_call_count} tools · {run.duration_ms ?? 0} ms ·{" "}
                            {new Date(run.started_at).toLocaleString("en-IN")}
                          </p>
                        </div>

                        <Button
                          size="sm"
                          variant={replayId === run.run_id ? "secondary" : "outline"}
                          onClick={() => setReplayId(run.run_id)}
                        >
                          Replay
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {replayId && replay.data?.run ? (
                  <div className="space-y-3">
                    <Separator />
                    <p className="text-sm font-medium text-foreground">Execution timeline</p>
                    <ol className="space-y-2">
                      {replay.data.steps.map((step) => (
                        <li
                          key={step.step_number}
                          className="flex gap-3 rounded-md border border-border bg-muted/30 p-3"
                        >
                          <StatusDot status={step.status} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {step.step_number}. {step.tool_name ?? step.step_type}{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                {step.latency_ms ?? 0} ms
                              </span>
                            </p>
                            <p className="break-words font-mono text-xs text-muted-foreground">
                              in · {step.input_summary ?? "—"}
                            </p>
                            <p className="break-words text-sm text-foreground/90">
                              out · {step.output_summary ?? "—"}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    {replay.data.audit.length ? (
                      <>
                        <p className="text-sm font-medium text-foreground">Checkout audit trail</p>
                        <ul className="space-y-1">
                          {replay.data.audit.map((event) => (
                            <li key={event.id} className="font-mono text-xs text-muted-foreground">
                              {new Date(event.created_at).toLocaleTimeString("en-IN")} · {event.event}{" "}
                              · {event.actor_type} · {event.from_status ?? "—"} →{" "}
                              {event.to_status ?? "—"} {event.reason ? `· ${event.reason}` : ""}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------- evidence ------------------------------- */}
          <TabsContent value="evidence" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="size-4" /> Aggregate evidence
                </CardTitle>
                <CardDescription>
                  Counted live from the database for the merchant you own.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Tool calls" value={String(ev?.tools.total ?? 0)} hint={`${ev?.tools.failed ?? 0} failed · avg ${ev?.tools.avg_latency_ms ?? 0} ms`} />
                <Metric label="Quotes issued" value={String(ev?.integrity.quotes_issued ?? 0)} hint="every one priced server-side" />
                <Metric label="Orders" value={String(ev?.checkout.orders ?? 0)} hint={`${ev?.checkout.completed ?? 0} completed · ${ev?.checkout.awaiting_payment ?? 0} awaiting payment`} />
                <Metric label="Payments verified" value={String(ev?.payments.verified ?? 0)} hint={`captured value ${money(ev?.payments.captured_value ?? 0)}`} />
                <Metric label="Public API calls" value={String(ev?.api.requests ?? 0)} hint={`${ev?.api.errors ?? 0} errors · avg ${ev?.api.avg_latency_ms ?? 0} ms`} />
                <Metric label="Audit events" value={String(ev?.integrity.audit_events ?? 0)} hint="append-only checkout trail" />
                <Metric label="Negotiations countered" value={String(ev?.negotiation.countered ?? 0)} hint={`${ev?.negotiation.rejected ?? 0} rejected by policy`} />
                <Metric label="Webhook deliveries" value={String(ev?.webhooks.total ?? 0)} hint={`${ev?.webhooks.processed ?? 0} processed · ${ev?.webhooks.rejected ?? 0} rejected`} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------- security ------------------------------- */}
          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4" /> Implemented security controls
                </CardTitle>
                <CardDescription>
                  Each control is enforced in server code or in PostgreSQL — never in the browser and
                  never by prompt instructions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {SECURITY_CONTROLS.map((control) => (
                  <div key={control.control} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium text-foreground">{control.control}</p>
                    <p className="font-mono text-xs text-muted-foreground">{control.where}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{control.proof}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
