// Phase 08 — External AI Buyer Lab.
//
// Runs an autonomous buyer agent that reaches AgentCart only over the public
// Agent Commerce HTTP API, and shows the raw agent-to-agent traffic.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { CountUp } from "@/components/dashboard/CountUp";

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

function Metric({ label, value, hint }: { label: string; value: string | number | undefined | null; hint?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-sm border border-border/60 bg-muted/5 p-4 transition-colors hover:bg-muted/10"
    >
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <div className="text-xl font-bold text-foreground font-mono">
        <CountUp value={value} />
      </div>
      {hint ? <p className="text-[8px] font-bold uppercase tracking-tighter text-muted-foreground/40 mt-1">{hint}</p> : null}
    </motion.div>
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
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ block: "end", behavior: shouldReduceMotion ? "auto" : "smooth" });
  }, [run.calls.length, run.steps.length, shouldReduceMotion]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const running = run.status === "running";

  const staggerContainer = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1,
      },
    },
  };

  const itemReveal = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } } as any,
  };

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
      title="Agent Simulation Lab" 
      subtitle="Benchmark external AI buyers transacting entirely through your public commercial API."
      accountLabel={workspace.data?.profile.email ?? undefined}
    >
      <motion.div 
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="space-y-8"
      >
        <motion.header variants={itemReveal} className="flex flex-col gap-6 mb-8 border-b border-border/40 pb-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground uppercase">Simulator Console</h2>
            <div className="flex flex-wrap gap-4 mt-2">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-border/60 bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                <Network className="size-3" /> External Agent Testing
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-border/60 bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                <Globe className="size-3" /> Public API
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-border/60 bg-muted/20 text-[10px] font-bold text-copper uppercase tracking-widest">
                <ShieldCheck className="size-3 text-copper" /> Server-Authoritative
              </div>
            </div>
          </div>
        </motion.header>

        <div className="grid gap-6 lg:grid-cols-2">
            {/* LEFT: Simulation configuration */}
            <motion.div variants={itemReveal} className="space-y-6">
              <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border py-3">
                <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="size-3.5" /> Simulation Boundaries
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 pt-6 pb-6 text-xs sm:grid-cols-2">
        <div>
                  <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-foreground flex items-center gap-2 border-b border-border/40 pb-2">
                    Agent Can
                  </p>
                  <ul className="space-y-2">
                    {BUYER_CAN.map((item) => (
                      <li key={item} className="flex gap-2 text-muted-foreground leading-relaxed">
                        <Check className="mt-0.5 size-3 shrink-0 text-verified-green/60" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-copper flex items-center gap-2 border-b border-border/40 pb-2">
                    Agent Cannot
                  </p>
                  <ul className="space-y-2">
                    {BUYER_CANNOT.map((item) => (
                      <li key={item} className="flex gap-2 text-muted-foreground leading-relaxed">
                        <Lock className="mt-0.5 size-3 shrink-0 text-copper/40" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border py-3">
                <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Bot className="size-3.5" /> Initialize External Agent
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-3">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Scenario Presets</Label>
                  <div className="flex flex-wrap gap-2">
                    {EXTERNAL_SCENARIOS.map((scenario) => (
                      <motion.div
                        key={scenario.id}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={running}
                          className="rounded-sm h-8 text-[9px] font-bold uppercase tracking-widest border-border/60 bg-muted/10 hover:bg-copper/10 hover:text-copper transition-colors"
                          onClick={() => {
                            setInput(scenario.prompt);
                            void start(scenario.prompt, scenario.id);
                          }}
                          title={scenario.expectation}
                        >
                          {scenario.label}
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Shopping Intent</Label>
                  <div className="relative">
                    <Textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      rows={4}
                      maxLength={600}
                      placeholder="e.g. Find me a developer laptop under ₹60,000 and prepare checkout."
                      disabled={running}
                      className="rounded-sm border-border bg-muted/5 focus-visible:ring-copper/20 resize-none text-sm font-medium leading-relaxed"
                    />
                    <div className="absolute bottom-2 right-2 flex items-center gap-2">
                      {run.runId ? (
                        <span className="font-mono text-[9px] text-muted-foreground/40 uppercase tracking-tight">
                          ID: {run.runId.slice(0, 8)} · {run.model?.replace('gemini-', '') ?? "—"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <motion.div 
                    className="flex-1"
                    whileHover={!running && input.trim().length > 0 ? { y: -1 } : {}}
                    whileTap={!running && input.trim().length > 0 ? { scale: 0.98 } : {}}
                  >
                    <Button 
                      onClick={() => void start(input)} 
                      disabled={running || input.trim().length === 0}
                      className="w-full rounded-sm bg-copper hover:bg-copper/90 text-white font-bold uppercase tracking-widest h-10 px-6 shadow-sm shadow-copper/20"
                    >
                      {running ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 size-4" />
                      )}
                      {running ? "Simulating…" : "Launch Agent"}
                    </Button>
                  </motion.div>
                  {running ? (
                    <Button 
                      variant="outline" 
                      onClick={() => abortRef.current?.abort()}
                      className="rounded-sm border-border font-bold uppercase tracking-widest h-10 px-4"
                    >
                      <Square className="mr-2 size-4" /> Stop
                    </Button>
                  ) : null}
                </div>

                {run.error ? (
                  <div className="flex items-start gap-2 rounded-sm border border-destructive/20 bg-destructive/5 p-3 text-[11px] text-foreground leading-relaxed">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    {run.error}
                  </div>
                ) : null}
              </CardContent>
            </Card>
                    </motion.div>

          {/* RIGHT: Agent execution / current run */}
          <motion.div variants={itemReveal} className="space-y-6 flex flex-col">
            <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden h-full">
              <CardHeader className="bg-muted/30 border-b border-border py-3">
                <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Activity className="size-3.5" /> Agent-to-Agent Journey
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-2">
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
                    <motion.div
                      key={stage.key}
                      layout
                      initial={{ opacity: 0.5 }}
                      animate={{ 
                        opacity: reached ? 1 : 0.5,
                        scale: reached ? 1 : 0.98,
                        borderColor: reached ? "var(--verified-green)" : "rgba(var(--border), 0.6)"
                      }}
                      className="flex items-center justify-between gap-3 rounded-sm border border-border/60 bg-muted/10 px-4 py-2.5 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground">{stage.label}</p>
                          <span className="text-[8px] font-bold uppercase tracking-tighter text-muted-foreground/40 font-mono">
                            {stage.endpoint}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className={cn(
                          "text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border",
                          stage.actor === "buyer" 
                            ? "text-blue-400 border-blue-400/20 bg-blue-400/5" 
                            : stage.actor === "server"
                              ? "text-copper border-copper/20 bg-copper/5"
                              : stage.actor === "razorpay"
                                ? "text-indigo-400 border-indigo-400/20 bg-indigo-400/5"
                                : "text-emerald-400 border-emerald-400/20 bg-emerald-400/5"
                        )}>
                          {stage.actor}
                        </span>
                        {stageDone ? (
                          <Check className="size-3.5 text-verified-green" />
                        ) : (
                          <span className="text-[8px] font-bold uppercase tracking-tight text-muted-foreground/40">{note ?? "Pending"}</span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </CardContent>
            </Card>
          </motion.div>
        </div>


        {/* server-authoritative outcome */}
        <motion.div variants={itemReveal}>
          <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border py-3">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <ShieldCheck className="size-3.5" /> Server-Authoritative Outcome
              </CardTitle>
            </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 mb-4">
              <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/20 px-2 py-1 rounded border border-border/40 w-fit">
                <Globe className="size-3" /> External API Result
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed italic border-l-2 border-copper/40 pl-3">
                Every value here is copied from an API response, not generated by the model.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {!state ? (
                <div className="col-span-full py-12 flex flex-col items-center justify-center text-center border-2 border-dashed border-border/40 rounded-sm">
                  <Activity className="size-8 text-muted-foreground/20 mb-3" />
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Run the agent to populate the outcome.</p>
                </div>
              ) : (
                <>
                  {state.manifest ? (
                    <div className="rounded-sm border border-border/60 bg-muted/5 p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <p className="text-[10px] font-bold text-foreground uppercase tracking-widest">Manifest</p>
                        <Badge variant="outline" className="text-[8px] font-bold border-copper/30 text-copper">AUTHORITATIVE</Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-foreground">{state.manifest.merchant}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Currency: {state.manifest.currency} · Max Discount: {state.manifest.max_discount_percent ?? "—"}%
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Approval &gt; {inr(state.manifest.approval_required_above, state.manifest.currency)}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {state.selected_product ? (
                    <div className="rounded-sm border border-border/60 bg-muted/5 p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <p className="text-[10px] font-bold text-foreground uppercase tracking-widest">Selected Product</p>
                        <Badge variant="outline" className="text-[8px] font-bold border-blue-400/30 text-blue-400">DISCOVERED</Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-foreground">{state.selected_product.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          List Price: {inr(state.selected_product.price, state.selected_product.currency)}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">
                          SKU: {state.selected_product.product_id}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {state.quote ? (
                    <div className="rounded-sm border border-border/60 bg-muted/5 p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <p className="text-[10px] font-bold text-foreground uppercase tracking-widest">Pricing Quote</p>
                        <Badge variant="outline" className="text-[8px] font-bold border-emerald-400/30 text-emerald-400">SERVER COMPUTED</Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-foreground">{inr(state.quote.final_amount, state.quote.currency)}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Qty: {state.quote.quantity} · Discount: {state.quote.allowed_discount_percent}%
                        </p>
                        <p className="text-[10px] text-copper font-bold uppercase tracking-tighter truncate">
                          Reason: {state.quote.policy_reason}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {state.negotiation ? (
                    <div className="rounded-sm border border-border/60 bg-muted/5 p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <p className="text-[10px] font-bold text-foreground uppercase tracking-widest">Negotiation</p>
                        <Badge variant="outline" className="text-[8px] font-bold border-indigo-400/30 text-indigo-400">ROUND {state.negotiation.round_number}</Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-foreground">{state.negotiation.decision} at {state.negotiation.approved_discount_percent}%</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Requested: {state.negotiation.requested_discount_percent}% · Policy Limit: {state.negotiation.policy_limit_percent}%
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {state.checkout ? (
                    <div className="rounded-sm border border-border/60 bg-muted/5 p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <p className="text-[10px] font-bold text-foreground uppercase tracking-widest">Checkout Outcome</p>
                        <Badge variant={state.checkout.status === 'completed' ? "outline" : "outline"} className={cn(
                          "text-[8px] font-bold",
                          state.checkout.status === 'completed' ? "border-emerald-400/30 text-emerald-400" : "border-amber-400/30 text-amber-400"
                        )}>
                          {state.checkout.status?.toUpperCase() ?? "REJECTED"}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-bold text-foreground">{inr(state.checkout.final_amount, state.checkout.currency ?? "INR")}</p>
                        <p className="text-[10px] text-muted-foreground font-mono leading-tight">{state.checkout.next_action}</p>
                        {state.checkout.error ? (
                          <p className="text-[9px] text-destructive font-mono mt-2 bg-destructive/5 px-1.5 py-0.5 rounded border border-destructive/10">
                            ERR: {state.checkout.error.code}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {state.no_match ? (
                    <div className="col-span-full rounded-sm border border-border/60 bg-muted/5 p-4">
                      <p className="text-xs text-muted-foreground font-medium italic">
                        No matching product found in catalog. The external agent reported a clean no-match.
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {run.notices.length > 0 ? (
              <div className="mt-6 space-y-2 border-t border-border/40 pt-4">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Protocol Notices</p>
                {run.notices.map((n, i) => (
                  <p key={`${n.code}-${i}`} className="text-[10px] text-muted-foreground font-mono flex items-center gap-2">
                    <span className="text-copper/60">[{n.code}]</span> {n.message}
                  </p>
                ))}
              </div>
            ) : null}
            </CardContent>
          </Card>
        </motion.div>
        </motion.div>


        {/* API traffic */}
        <motion.div variants={itemReveal}>
          <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border py-3">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Globe className="size-3.5" /> Public API Traffic
              </CardTitle>
            </CardHeader>
          <CardContent className="pt-6">
            {run.calls.length === 0 ? (
              <p className="text-xs text-muted-foreground font-medium italic">No API calls yet.</p>
            ) : (
              <div className="space-y-1">
                <AnimatePresence initial={false}>
                  {run.calls.map((call, index) => (
                    <motion.div
                      key={`${call.request_id || call.path}-${index}`}
                      initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex flex-col gap-1 rounded-sm border border-border/40 bg-muted/5 p-2.5 text-[10px] font-mono"
                    >
                    <div className="flex flex-wrap items-center gap-3">
                      <div className={cn(
                        "px-1.5 py-0.5 rounded-sm font-bold uppercase text-[9px]",
                        call.ok ? "text-emerald-400 bg-emerald-400/10 border border-emerald-400/20" : "text-destructive bg-destructive/10 border border-destructive/20"
                      )}>
                        {call.method}
                      </div>
                      <span className="text-foreground font-bold">{call.path}</span>
                      <div className={cn(
                        "px-1.5 py-0.5 rounded-sm border",
                        call.status >= 200 && call.status < 300 ? "text-emerald-400 border-emerald-400/20" : "text-amber-400 border-amber-400/20"
                      )}>
                        {call.status}
                      </div>
                      <span className="text-muted-foreground/60">{call.latency_ms}ms</span>
                      {call.request_id ? (
                        <span className="text-muted-foreground/40 ml-auto">CID: {call.request_id.slice(0, 8)}</span>
                      ) : null}
                    </div>
                    <div className="grid gap-2 border-t border-border/20 pt-1.5 mt-1">
                      <p className="text-muted-foreground break-all"><span className="text-blue-400/60 font-bold uppercase mr-1">REQ</span>{call.request_summary}</p>
                      <p className="text-muted-foreground break-all"><span className="text-copper/60 font-bold uppercase mr-1">RES</span>{call.response_summary}</p>
                    </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <div ref={traceEndRef} />
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

        {/* agent trace + final message */}
        <motion.div variants={itemReveal} className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border py-3">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Execution Trace</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {run.steps.length === 0 ? (
                <p className="text-xs text-muted-foreground font-medium italic">No steps yet.</p>
              ) : (
                <div className="space-y-1.5">
                  <AnimatePresence initial={false}>
                    {run.steps.map((step) => (
                      <motion.div
                        key={step.step_number}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-start justify-between gap-3 rounded-sm border border-border/40 bg-muted/5 p-2.5 text-[10px] font-mono transition-colors hover:bg-muted/10"
                      >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-copper font-bold">{step.step_number}.</span>
                          <p className="font-bold text-foreground uppercase tracking-tight">{step.label}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[9px] text-muted-foreground/60 uppercase tracking-widest font-bold">
                          <span>{step.step_type}</span>
                          {step.tool_name ? <span className="text-blue-400/60 border border-blue-400/20 px-1 rounded-sm bg-blue-400/5">{step.tool_name}</span> : null}
                          {step.policy_decision ? <span className="text-amber-400/60 border border-amber-400/20 px-1 rounded-sm bg-amber-400/5">DECISION: {step.policy_decision}</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className="text-[8px] font-bold py-0 h-4 border-border/60">{step.status.toUpperCase()}</Badge>
                        {step.latency_ms ? <span className="text-muted-foreground/40 text-[9px]">{step.latency_ms}ms</span> : null}
                      </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
              {run.summary ? (
                <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3 text-[9px] font-bold font-mono text-muted-foreground/60 uppercase tracking-widest">
                  <span>STOP: {run.summary.stop_reason}</span>
                  <span>{run.summary.tool_call_count} CALLS · {run.summary.duration_ms}MS</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border py-3">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Buyer Agent Report</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {run.text.trim().length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center text-center border-2 border-dashed border-border/40 rounded-sm">
                  <Bot className="size-6 text-muted-foreground/20 mb-2" />
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                    {running ? "Synthesizing report…" : "No report yet."}
                  </p>
                </div>
              ) : (
                <div className="text-[11px] text-foreground font-medium leading-relaxed bg-muted/5 p-4 rounded-sm border border-border/40 whitespace-pre-wrap border-l-2 border-l-blue-400/40">
                  {run.text}
                </div>
              )}
            </CardContent>
          </Card>
          </motion.div>
        </div>
      </motion.div>


        {/* evaluation metrics */}
        <motion.div variants={itemReveal}>
          <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border py-3">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Gauge className="size-4" /> Evaluation
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "External runs", value: m?.runs.total, hint: `${m?.runs.completed ?? 0} COMPLETED · ${m?.runs.avg_duration_ms ?? 0}MS AVG` },
                { label: "Quotes issued", value: m?.funnel.quote_issued, hint: `${m?.funnel.checkout_requested ?? 0} CHECKOUT REQ` },
                { label: "Policy-capped offers", value: m?.safety.policy_capped_quotes, hint: `${m?.safety.approval_required_orders ?? 0} HELD FOR APPROVAL` },
                { label: "Public API calls", value: m?.api.public_requests, hint: `${m?.api.error_responses ?? 0} ERR · ${m?.api.avg_latency_ms ?? 0}MS AVG` }
              ].map(stat => (
                <Metric key={stat.label} label={stat.label} value={stat.value ?? 0} hint={stat.hint} />
              ))}
            </div>

            {m && m.tools.length > 0 ? (
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-foreground uppercase tracking-widest border-b border-border/40 pb-2 flex items-center gap-2">
                  <Activity className="size-3" /> Tool Reliability
                </p>
                <div className="rounded-sm border border-border/40 overflow-hidden">
                  <table className="w-full text-[10px] font-mono">
                    <thead className="bg-muted/30 border-b border-border/40 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                      <tr>
                        <th className="px-4 py-2 text-left">Tool</th>
                        <th className="px-4 py-2 text-right">Calls</th>
                        <th className="px-4 py-2 text-right">Success</th>
                        <th className="px-4 py-2 text-right">Refused</th>
                        <th className="px-4 py-2 text-right">Avg Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {m.tools.map((tool) => (
                        <tr key={tool.tool_name} className="bg-muted/5 hover:bg-muted/10 transition-colors">
                          <td className="px-4 py-2 text-foreground font-bold uppercase tracking-tight">{tool.tool_name}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{tool.calls}</td>
                          <td className="px-4 py-2 text-right text-emerald-400 font-bold">{tool.success}</td>
                          <td className="px-4 py-2 text-right text-amber-400 font-bold">{tool.failed}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{tool.avg_latency_ms ?? 0}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {m && m.api.by_endpoint.length > 0 ? (
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-foreground uppercase tracking-widest border-b border-border/40 pb-2 flex items-center gap-2">
                  <Network className="size-3" /> Endpoint Traffic
                </p>
                <div className="rounded-sm border border-border/40 overflow-hidden">
                  <table className="w-full text-[10px] font-mono">
                    <thead className="bg-muted/30 border-b border-border/40 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                      <tr>
                        <th className="px-4 py-2 text-left">Endpoint</th>
                        <th className="px-4 py-2 text-right">Requests</th>
                        <th className="px-4 py-2 text-right">Errors</th>
                        <th className="px-4 py-2 text-right">Avg Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {m.api.by_endpoint.map((row) => (
                        <tr key={row.endpoint} className="bg-muted/5 hover:bg-muted/10 transition-colors">
                          <td className="px-4 py-2 text-foreground font-bold truncate max-w-[200px]">{row.endpoint}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{row.requests}</td>
                          <td className="px-4 py-2 text-right text-amber-400 font-bold">{row.errors}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{row.avg_latency_ms ?? 0}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </motion.div>
    </AppShell>
  );
}

