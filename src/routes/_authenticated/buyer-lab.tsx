// Phase 08 — External AI Buyer Lab.
//
// Runs an autonomous buyer agent that reaches AgentCart only over the public
// Agent Commerce HTTP API, and shows the raw agent-to-agent traffic.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  Bot,
  Check,
  Gauge,
  Globe,
  Loader2,
  Lock,
  Network,
  Send,
  ShieldCheck,
  Square,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  A2A_STAGES,
  BUYER_CAN,
  BUYER_CANNOT,
  EXTERNAL_SCENARIOS,
} from "@/lib/external-buyer-facts";
import { getExternalBuyerMetrics } from "@/lib/external-buyer.functions";
import { getWorkspace } from "@/lib/merchant.functions";

export const Route = createFileRoute("/_authenticated/buyer-lab")({
  head: () => ({
    meta: [
      { title: "External AI Buyer Lab · AgentCart" },
      {
        name: "description",
        content:
          "Watch an external AI buyer agent transact with AgentCart entirely over the public Agent Commerce API, with full request-level traces.",
      },
      { property: "og:title", content: "External AI Buyer Lab · AgentCart" },
      {
        property: "og:description",
        content:
          "Agent-to-agent commerce: an autonomous buyer discovers, negotiates and checks out through public HTTP APIs only.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BuyerLabPage,
});

/* --------------------------------- types ---------------------------------- */

type ApiCall = {
  method: string;
  path: string;
  status: number;
  ok: boolean;
  latency_ms: number;
  request_id: string | null;
  request_summary: string;
  response_summary: string;
};

type Step = {
  step_number: number;
  step_type: string;
  status: string;
  label: string;
  latency_ms?: number;
  tool_name?: string;
  policy_decision?: string;
};

type Notice = { code: string; message: string };

type RunView = {
  status: "idle" | "running" | "done" | "error";
  prompt: string;
  sessionId: string | null;
  runId: string | null;
  model: string | null;
  runType: string | null;
  merchant: { slug: string; name: string; currency: string } | null;
  steps: Step[];
  calls: ApiCall[];
  notices: Notice[];
  text: string;
  state: any | null;
  summary: { stop_reason: string; duration_ms: number; tool_call_count: number } | null;
  error: string | null;
};

const emptyRun: RunView = {
  status: "idle",
  prompt: "",
  sessionId: null,
  runId: null,
  model: null,
  runType: null,
  merchant: null,
  steps: [],
  calls: [],
  notices: [],
  text: "",
  state: null,
  summary: null,
  error: null,
};

function inr(amount: number | null | undefined, currency = "INR") {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    amount,
  );
}

/* ------------------------------- components -------------------------------- */

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block size-2 rounded-full ${ok ? "bg-primary" : "bg-destructive"}`}
      aria-hidden
    />
  );
}

function BuyerLabPage() {
  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => getWorkspace() });
  const fetchMetrics = useServerFn(getExternalBuyerMetrics);
  const metrics = useQuery({
    queryKey: ["external-buyer", "metrics"],
    queryFn: () => fetchMetrics(),
  });

  const [input, setInput] = useState(EXTERNAL_SCENARIOS[0]?.prompt ?? "");
  const [run, setRun] = useState<RunView>(emptyRun);
  const abortRef = useRef<AbortController | null>(null);
  const traceEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ block: "end" });
  }, [run.calls.length, run.steps.length]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const running = run.status === "running";

  async function start(message: string, scenarioId?: string) {
    if (!message.trim() || running) return;

    setRun({ ...emptyRun, status: "running", prompt: message.trim() });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your session expired. Please sign in again.");

      const response = await fetch("/api/agent/external-buyer", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: message.trim(), scenario_id: scenarioId ?? null }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "The external buyer service is unavailable.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          let event: any;
          try {
            event = JSON.parse(trimmed.slice(5).trim());
          } catch {
            continue;
          }

          if (event.type === "session") {
            setRun((r) => ({
              ...r,
              sessionId: event.session_id,
              runId: event.run_id,
              model: event.model,
              runType: event.run_type,
              merchant: event.merchant ?? null,
            }));
          } else if (event.type === "step") {
            setRun((r) => ({
              ...r,
              steps: [...r.steps.filter((s) => s.step_number !== event.step_number), event as Step].sort(
                (a, b) => a.step_number - b.step_number,
              ),
            }));
          } else if (event.type === "api_call") {
            setRun((r) => ({ ...r, calls: [...r.calls, event.call as ApiCall] }));
          } else if (event.type === "text") {
            setRun((r) => ({ ...r, text: r.text + event.delta }));
          } else if (event.type === "state") {
            setRun((r) => ({ ...r, state: event.state }));
          } else if (event.type === "final_text") {
            // Monetary-provenance validation may replace the streamed answer.
            if (event.corrected) setRun((r) => ({ ...r, text: event.text }));

          } else if (event.type === "notice") {
            setRun((r) => ({
              ...r,
              notices: [...r.notices, { code: event.code, message: event.message }],
            }));
          } else if (event.type === "done") {
            setRun((r) => ({
              ...r,
              status: "done",
              state: event.state ?? r.state,
              summary: {
                stop_reason: event.stop_reason,
                duration_ms: event.duration_ms,
                tool_call_count: event.tool_call_count,
              },
            }));
          }
        }
      }

      setRun((r) => (r.status === "running" ? { ...r, status: "done" } : r));
      void metrics.refetch();
    } catch (error) {
      if (controller.signal.aborted) {
        setRun((r) => ({ ...r, status: "done" }));
        return;
      }
      setRun((r) => ({
        ...r,
        status: "error",
        error: error instanceof Error ? error.message : "The external buyer run failed.",
      }));
    } finally {
      abortRef.current = null;
    }
  }

  const state = run.state;
  const m = metrics.data;

  return (
    <AppShell
      title="External AI Buyer Lab"
      subtitle="An autonomous buyer agent that transacts with AgentCart over the public Agent Commerce API only — no shared database, no internal shortcuts."
      accountLabel={workspace.data?.profile?.email ?? undefined}
    >
      <div className="space-y-6">
        {/* boundary banner */}
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="size-4" /> Agent-to-agent boundary
            </CardTitle>
            <CardDescription>
              The buyer agent runs outside the commerce core. Every action below is an HTTP call to a
              public endpoint; prices, discounts, inventory and order state are decided by AgentCart's
              server, never by the model.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Check className="size-4 text-primary" /> The buyer agent can
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {BUYER_CAN.map((item) => (
                  <li key={item} className="flex gap-2">
                    <ArrowRight className="mt-0.5 size-3.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Ban className="size-4 text-destructive" /> The buyer agent cannot
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {BUYER_CANNOT.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Lock className="mt-0.5 size-3.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* control */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-4" /> Run the external buyer
            </CardTitle>
            <CardDescription>
              Pick a scenario or write your own shopping intent. The agent discovers the merchant from
              the manifest, then works only through public endpoints.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {EXTERNAL_SCENARIOS.map((scenario) => (
                <Button
                  key={scenario.id}
                  size="sm"
                  variant="outline"
                  disabled={running}
                  onClick={() => {
                    setInput(scenario.prompt);
                    void start(scenario.prompt, scenario.id);
                  }}
                  title={scenario.expectation}
                >
                  {scenario.label}
                </Button>
              ))}
            </div>

            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="e.g. Find me a developer laptop under ₹60,000 and prepare checkout."
              disabled={running}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void start(input)} disabled={running || input.trim().length === 0}>
                {running ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Send className="mr-2 size-4" />
                )}
                {running ? "Running…" : "Run buyer agent"}
              </Button>
              {running ? (
                <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                  <Square className="mr-2 size-4" /> Stop
                </Button>
              ) : null}
              {run.runId ? (
                <span className="font-mono text-xs text-muted-foreground">
                  run {run.runId.slice(0, 8)} · {run.model ?? "—"} · {run.runType ?? "—"}
                </span>
              ) : null}
            </div>

            {run.error ? (
              <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                {run.error}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* transaction journey */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4" /> Agent-to-agent journey
              </CardTitle>
              <CardDescription>
                Who decides at each hop. Server-decided stages are authoritative.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {A2A_STAGES.map((stage) => {
                const reached = run.calls.some((c) =>
                  stage.key === "manifest"
                    ? c.path.includes("agent-manifest")
                    : stage.key === "product"
                      ? /\/products\//.test(c.path)
                      : c.path.includes(stage.key),
                );
                const note =
                  stage.key === "approval"
                    ? state?.checkout?.approval_required
                      ? "awaiting merchant"
                      : state?.checkout?.order_id
                        ? "not required"
                        : null
                    : stage.key === "payment"
                      ? (state?.checkout?.payment_state ?? null)
                      : null;
                const stageDone = note ? false : reached;
                return (
                  <div
                    key={stage.key}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{stage.label}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {stage.endpoint}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {stage.actor === "buyer" ? "buyer decides" : `${stage.actor} decides`}
                      </Badge>
                      {stageDone ? (
                        <Check className="size-4 text-primary" />
                      ) : (
                        <span className="text-xs text-muted-foreground">{note ?? "pending"}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* buyer state */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4" /> Server-authoritative outcome
              </CardTitle>
              <CardDescription>
                Every value here is copied from an API response, not generated by the model.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!state ? (
                <p className="text-muted-foreground">Run the agent to populate the outcome.</p>
              ) : (
                <>
                  {state.manifest ? (
                    <div className="rounded-md border border-border p-3">
                      <p className="font-medium text-foreground">
                        {state.manifest.merchant} · {state.manifest.currency}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Max discount {state.manifest.max_discount_percent ?? "—"}% · approval above{" "}
                        {inr(state.manifest.approval_required_above, state.manifest.currency)} · max order{" "}
                        {inr(state.manifest.max_order_value, state.manifest.currency)}
                      </p>
                    </div>
                  ) : null}

                  {state.selected_product ? (
                    <div className="rounded-md border border-border p-3">
                      <p className="font-medium text-foreground">{state.selected_product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        List price {inr(state.selected_product.price, state.selected_product.currency)} ·{" "}
                        <span className="font-mono">{state.selected_product.product_id.slice(0, 8)}</span>
                      </p>
                    </div>
                  ) : null}

                  {state.quote ? (
                    <div className="rounded-md border border-border p-3">
                      <p className="font-medium text-foreground">
                        Quote {inr(state.quote.final_amount, state.quote.currency)} ·{" "}
                        {state.quote.quantity} unit(s)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Requested {state.quote.requested_discount_percent}% · allowed{" "}
                        {state.quote.allowed_discount_percent}% · {state.quote.policy_reason}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        quote {state.quote.quote_id.slice(0, 8)} · expires{" "}
                        {new Date(state.quote.expires_at).toLocaleTimeString("en-IN")}
                      </p>
                    </div>
                  ) : null}

                  {state.negotiation ? (
                    <div className="rounded-md border border-border p-3">
                      <p className="font-medium text-foreground">
                        Negotiation: {state.negotiation.decision} at{" "}
                        {state.negotiation.approved_discount_percent}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Asked {state.negotiation.requested_discount_percent}% · policy limit{" "}
                        {state.negotiation.policy_limit_percent}% · round{" "}
                        {state.negotiation.round_number} · {state.negotiation.rounds_remaining} left
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {state.negotiation.policy_reason}
                      </p>
                    </div>
                  ) : null}

                  {state.checkout ? (
                    <div className="rounded-md border border-border p-3">
                      <p className="font-medium text-foreground">
                        Checkout {state.checkout.status ?? "rejected"} ·{" "}
                        {inr(state.checkout.final_amount, state.checkout.currency ?? "INR")}
                      </p>
                      <p className="text-xs text-muted-foreground">{state.checkout.next_action}</p>
                      {state.checkout.error ? (
                        <p className="text-xs text-destructive">
                          {state.checkout.error.code}: {state.checkout.error.message}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {state.no_match ? (
                    <p className="rounded-md border border-border p-3 text-muted-foreground">
                      No matching product. The agent reported the honest no-match instead of inventing
                      one.
                    </p>
                  ) : null}
                </>
              )}

              {run.notices.length > 0 ? (
                <div className="space-y-1">
                  <Separator />
                  {run.notices.map((n, i) => (
                    <p key={`${n.code}-${i}`} className="text-xs text-muted-foreground">
                      <span className="font-mono">{n.code}</span> · {n.message}
                    </p>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* API traffic */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="size-4" /> Public API traffic
            </CardTitle>
            <CardDescription>
              Live request log for this run: method, path, status, latency and correlation id.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {run.calls.length === 0 ? (
              <p className="text-sm text-muted-foreground">No API calls yet.</p>
            ) : (
              <div className="space-y-2">
                {run.calls.map((call, index) => (
                  <div
                    key={`${call.path}-${index}`}
                    className="rounded-md border border-border p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusDot ok={call.ok} />
                      <span className="font-mono font-medium text-foreground">
                        {call.method} {call.path}
                      </span>
                      <Badge variant={call.ok ? "secondary" : "destructive"} className="text-[10px]">
                        {call.status}
                      </Badge>
                      <span className="text-muted-foreground">{call.latency_ms} ms</span>
                      {call.request_id ? (
                        <span className="font-mono text-muted-foreground">
                          req {call.request_id.slice(0, 8)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 break-all font-mono text-muted-foreground">
                      → {call.request_summary}
                    </p>
                    <p className="break-all font-mono text-muted-foreground">
                      ← {call.response_summary}
                    </p>
                  </div>
                ))}
                <div ref={traceEndRef} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* agent trace + final message */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Execution trace</CardTitle>
              <CardDescription>
                Persisted to the standard observability tables and replayable in Judge Mode.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {run.steps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No steps yet.</p>
              ) : (
                <ol className="space-y-2">
                  {run.steps.map((step) => (
                    <li
                      key={step.step_number}
                      className="flex items-start justify-between gap-3 rounded-md border border-border p-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {step.step_number}. {step.label}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {step.step_type}
                          {step.tool_name ? ` · ${step.tool_name}` : ""}
                          {step.policy_decision ? ` · policy: ${step.policy_decision}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {step.status}
                        {step.latency_ms ? ` · ${step.latency_ms} ms` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {run.summary ? (
                <p className="mt-3 font-mono text-xs text-muted-foreground">
                  stop: {run.summary.stop_reason} · {run.summary.tool_call_count} tool calls ·{" "}
                  {run.summary.duration_ms} ms
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Buyer agent report</CardTitle>
              <CardDescription>The agent's own summary of what the server decided.</CardDescription>
            </CardHeader>
            <CardContent>
              {run.text.trim().length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {running ? "Waiting for the agent's report…" : "No report yet."}
                </p>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-foreground">{run.text}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* evaluation metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="size-4" /> External buyer evaluation
            </CardTitle>
            <CardDescription>
              Aggregated from persisted runs, tool calls and public API request logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="External runs"
                value={String(m?.runs.total ?? 0)}
                hint={`${m?.runs.completed ?? 0} completed · avg ${m?.runs.avg_duration_ms ?? 0} ms`}
              />
              <Metric
                label="Quotes issued"
                value={String(m?.funnel.quote_issued ?? 0)}
                hint={`${m?.funnel.checkout_requested ?? 0} checkout requests`}
              />
              <Metric
                label="Policy-capped offers"
                value={String(m?.safety.policy_capped_quotes ?? 0)}
                hint={`${m?.safety.approval_required_orders ?? 0} orders held for approval`}
              />
              <Metric
                label="Public API calls"
                value={String(m?.api.public_requests ?? 0)}
                hint={`${m?.api.error_responses ?? 0} refused · avg ${m?.api.avg_latency_ms ?? 0} ms`}
              />
            </div>

            {m && m.tools.length > 0 ? (
              <div className="space-y-2">
                <Separator />
                <p className="text-sm font-medium text-foreground">Tool reliability</p>
                {m.tools.map((tool) => (
                  <div
                    key={tool.tool_name}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-foreground">{tool.tool_name}</span>
                    <span className="text-muted-foreground">
                      {tool.calls} calls · {tool.success} ok · {tool.failed} refused ·{" "}
                      {tool.avg_latency_ms ?? 0} ms avg
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {m && m.api.by_endpoint.length > 0 ? (
              <div className="space-y-2">
                <Separator />
                <p className="text-sm font-medium text-foreground">Endpoint traffic</p>
                {m.api.by_endpoint.map((row) => (
                  <div
                    key={row.endpoint}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-foreground">{row.endpoint}</span>
                    <span className="text-muted-foreground">
                      {row.requests} req · {row.errors} err · {row.avg_latency_ms ?? 0} ms avg
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
