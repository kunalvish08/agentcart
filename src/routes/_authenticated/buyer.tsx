import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Handshake,
  History,
  Loader2,
  PackageCheck,
  Receipt,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

import { AppShell } from "@/components/AppShell";
import { PaymentPanel } from "@/components/PaymentPanel";
import { CountUp } from "@/components/dashboard/CountUp";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { acceptRecommendation, listAgentSessions } from "@/lib/agent.functions";
import {
  getMyActiveOrders,
  getOrderStatus,
  requestBuyerCheckout,
  type BuyerActiveOrder,
} from "@/lib/checkout.functions";
import { CHECKOUT_STATE_LABELS, type CheckoutState } from "@/lib/checkout-state";
import { getWorkspace } from "@/lib/merchant.functions";

export const Route = createFileRoute("/_authenticated/buyer")({
  head: () => ({
    meta: [
      { title: "AI Buyer · Agentic Commerce Console" },
      {
        name: "description",
        content:
          "A bounded, tool-using AI buyer that searches the live catalog, inspects products and requests server-calculated quotes.",
      },
      { property: "og:title", content: "AI Buyer · Agentic Commerce Console" },
      {
        property: "og:description",
        content: "Tool-using shopping agent with server-authoritative pricing and a full activity trace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BuyerPage,
});

/* ---------------------------------- types ---------------------------------- */

type TraceStep = {
  step_number: number;
  step_type: string;
  status: string;
  label: string;
  latency_ms?: number;
  tool_name?: string;
};

type ProductCard = {
  product_id: string;
  name: string;
  price: number;
  currency: string;
  category: string | null;
  description: string | null;
  availability: string;
  stock_status: string;
  in_stock: boolean;
  relation_type?: string;
};

type GrowthPick = {
  recommendation_id: string | null;
  product_id: string;
  name: string;
  price: number;
  currency: string;
  recommendation_type: "upsell" | "cross_sell";
  reason: string;
  in_stock: boolean;
};

type NegotiationOutcome = {
  negotiation_available: boolean;
  decision: "accept" | "counter" | "reject";
  round_number: number;
  rounds_remaining: number;
  requested_discount_percent: number;
  policy_limit_percent: number;
  approved_discount_percent: number;
  policy_reason: string;
  message: string;
};

type Recommendation = {
  product: ProductCard;
  related: ProductCard[];
  quote: any | null;
  quote_error: { code: string; message: string } | null;
  searched_count: number | null;
  policy?: { max_discount_percent?: number; allow_negotiation?: boolean } | null;
  negotiation?: NegotiationOutcome | null;
  growth?: GrowthPick[];
  checkout?: CheckoutToolResult | null;
};

/** Exactly what the server's checkout tool returned — never model text. */
type CheckoutToolResult = {
  checkout_created: boolean;
  idempotent_replay?: boolean;
  error_code?: string;
  reason?: string;
  order?: {
    order_id: string;
    status: CheckoutState;
    currency: string;
    subtotal_amount: number;
    discount_amount: number;
    final_amount: number;
    approval_required: boolean;
    approval_reason: string | null;
    quantity?: number;
    product_name?: string | null;
  };
  trace?: Array<{ label: string; ok: boolean }>;
};


type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps: TraceStep[];
  recommendation?: Recommendation | null;
  notices: { code: string; message: string }[];
  meta?: {
    model?: string;
    duration_ms?: number;
    step_count?: number;
    tool_call_count?: number;
    total_tokens?: number | null;
    gateway_run_id?: string | null;
    stop_reason?: string;
    status?: string;
  };
};

const SUGGESTIONS = [
  "I need a coding laptop under ₹60,000.",
  "Can you give me a 5% discount on the DeveloperBook Pro 15?",
  "I want 25% off the DeveloperBook Pro 15 — 1 unit.",
  "What accessories go with the DeveloperBook Pro 15?",
];


function money(amount: number | string | null | undefined, currency = "INR") {
  const value = Number(amount ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

/* ---------------------------------- page ----------------------------------- */

function BuyerPage() {
  const fetchWorkspace = useServerFn(getWorkspace);
  const fetchSessions = useServerFn(listAgentSessions);
  const queryClient = useQueryClient();

  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => fetchWorkspace() });
  const sessions = useQuery({ queryKey: ["agent-sessions"], queryFn: () => fetchSessions() });

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, running]);

  async function send(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || running) return;

    const history = turns.map((t) => ({ role: t.role, content: t.content })).slice(-8);
    const assistantId = crypto.randomUUID();

    setTurns((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: message, steps: [], notices: [] },
      { id: assistantId, role: "assistant", content: "", steps: [], notices: [] },
    ]);
    setInput("");
    setRunning(true);

    const patch = (updater: (turn: Turn) => Turn) =>
      setTurns((prev) => prev.map((t) => (t.id === assistantId ? updater(t) : t)));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your session expired. Please sign in again.");

      const response = await fetch("/api/agent/buyer", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ message, session_id: sessionId, history }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? "The AI Buyer service is unavailable. Please try again.",
        );
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
            setSessionId(event.session_id);
            patch((t) => ({ ...t, meta: { ...t.meta, model: event.model } }));
          } else if (event.type === "step") {
            patch((t) => ({
              ...t,
              steps: [
                ...t.steps.filter((s) => s.step_number !== event.step_number),
                {
                  step_number: event.step_number,
                  step_type: event.step_type,
                  status: event.status,
                  label: event.label,
                  latency_ms: event.latency_ms,
                  tool_name: event.tool_name,
                },
              ].sort((a, b) => a.step_number - b.step_number),
            }));
          } else if (event.type === "text") {
            patch((t) => ({ ...t, content: t.content + event.delta }));
          } else if (event.type === "recommendation") {
            patch((t) => ({ ...t, recommendation: event.recommendation as Recommendation }));
          } else if (event.type === "notice") {
            patch((t) => ({
              ...t,
              notices: [...t.notices, { code: event.code, message: event.message }],
            }));
          } else if (event.type === "done") {
            patch((t) => ({
              ...t,
              meta: {
                ...t.meta,
                duration_ms: event.duration_ms,
                step_count: event.step_count,
                tool_call_count: event.tool_call_count,
                total_tokens: event.usage?.total_tokens ?? null,
                gateway_run_id: event.gateway_run_id ?? null,
                stop_reason: event.stop_reason,
                status: event.status,
              },
            }));
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Run cancelled."
          : error instanceof Error
            ? error.message
            : "Something went wrong.";
      patch((t) => ({ ...t, notices: [...t.notices, { code: "client_error", message }] }));
    } finally {
      setRunning(false);
      abortRef.current = null;
      void queryClient.invalidateQueries({ queryKey: ["agent-sessions"] });
    }
  }

  const merchant = workspace.data?.merchant;
  const shouldReduceMotion = useReducedMotion();

  const staggerContainer: any = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        duration: 0.5
      }
    }
  };

  const itemReveal: any = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 5 },
    show: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.4, ease: "easeOut" }
    }
  };

  return (
    <AppShell
      title="AI Buyer"
      subtitle="Your autonomous commerce agent"
      accountLabel={merchant?.name}
    >
      <motion.div 
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-6 max-w-7xl mx-auto px-4 py-4"
      >
        {/* 1. COMPACT HERO & STATUS BAR */}
        <motion.header variants={itemReveal} className="flex flex-col gap-4 pb-4 border-b border-border/40">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <motion.p variants={itemReveal} className="text-[10px] font-bold tracking-[0.2em] text-copper uppercase mb-1">AI BUYER</motion.p>
              <motion.h1 variants={itemReveal} className="text-xl font-bold tracking-tight text-foreground">Your autonomous commerce agent</motion.h1>
            </div>
            
            <motion.div variants={itemReveal} className="flex items-center gap-6 px-4 py-2 bg-muted/30 border border-border/40 rounded-md">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Tools</span>
                  <span className="text-xs font-mono font-bold text-foreground"><CountUp value={7} /></span>
                </div>
                <div className="h-3 w-px bg-border/40" />
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Max Steps</span>
                  <span className="text-xs font-mono font-bold text-foreground"><CountUp value={10} /></span>
                </div>
                <div className="h-3 w-px bg-border/40" />
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Max Tool Calls</span>
                  <span className="text-xs font-mono font-bold text-foreground"><CountUp value={20} /></span>
                </div>
                <div className="h-3 w-px bg-border/40" />
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Pricing</span>
                  <motion.span 
                    initial={{ backgroundColor: "transparent" }}
                    animate={{ backgroundColor: ["#22c55e10", "transparent"] }}
                    transition={{ duration: 1.5 }}
                    className="text-[10px] font-bold text-verified-green px-1.5 rounded"
                  >
                    SERVER
                  </motion.span>
                </div>
            </motion.div>
          </div>
        </motion.header>

        <motion.div variants={itemReveal} className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6 min-w-0">
            {/* 2. AGENT WORKSPACE (COMMAND CONSOLE) */}
            <motion.section variants={itemReveal} className="flex flex-col gap-4">
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-foreground">What are you looking for?</h2>
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  <span>USER INTENT</span>
                  <ChevronRight className="size-3" />
                  <span>AI AGENT</span>
                  <ChevronRight className="size-3" />
                  <span className="text-copper">SERVER DECISION</span>
                </div>
              </div>

              <motion.div variants={itemReveal} className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-copper/20 to-verified-green/20 rounded-lg blur opacity-20 group-focus-within:opacity-60 transition duration-500" />
                <div className="relative bg-card border border-border rounded-lg overflow-hidden shadow-sm">
                  <Textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send(input);
                      }
                    }}
                    placeholder='Enter your commerce intent...'
                    className="w-full min-h-[100px] bg-transparent border-0 focus-visible:ring-0 resize-none p-5 text-sm font-medium placeholder:text-muted-foreground/30"
                    disabled={running}
                  />
                  <div className="flex items-center justify-between px-5 py-3 bg-muted/20 border-t border-border/40">
                    <div className="flex flex-wrap gap-2">
                      {["Laptop under ₹60,000", "5% discount", "25% off", "Accessories"].map((s, idx) => (
                        <motion.button
                          key={s}
                          type="button"
                          onClick={() => setInput(s)}
                          variants={{
                            hidden: { opacity: 0, y: 5 },
                            show: { 
                              opacity: 1, 
                              y: 0,
                              transition: { delay: 0.1 + idx * 0.05 } 
                            }
                          }}
                          whileHover={{ y: -2, borderColor: "rgba(213, 155, 98, 0.4)", backgroundColor: "rgba(213, 155, 98, 0.05)" }}
                          whileTap={{ scale: 0.98 }}
                          className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded border border-border/60 bg-background transition-colors"
                        >
                          {s}
                        </motion.button>
                      ))}
                    </div>
                    {running ? (
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => abortRef.current?.abort()}
                        className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest"
                      >
                        <Loader2 className="mr-2 size-3 animate-spin" />
                        Stop Agent
                      </Button>
                    ) : (
                      <motion.div
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Button 
                          onClick={() => void send(input)} 
                          disabled={!input.trim()}
                          className="h-8 px-4 bg-copper hover:bg-copper/90 text-white text-[10px] font-bold uppercase tracking-widest"
                        >
                          <Send className="mr-2 size-3" />
                          Ask Agent
                        </Button>
                      </motion.div>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.section>

            {/* 3. AGENT WORKSPACE + SERVER AUTHORITY */}
            <motion.div variants={itemReveal} className="flex flex-col md:flex-row gap-6 border border-border/40 rounded-lg overflow-hidden bg-card/50">
              {/* LEFT: AGENT WORKSPACE */}
              <motion.section variants={itemReveal} className="flex-1 flex flex-col gap-4 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">Agent Workspace</h2>
                  {sessionId && (
                    <span className="text-[9px] font-mono text-muted-foreground/60 uppercase">Session: {sessionId.slice(0, 8)}</span>
                  )}
                </div>

                {turns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border/60 rounded bg-muted/5">
                    <Bot className="size-8 text-muted-foreground/20 mb-3" />
                    <p className="text-[9px] font-bold tracking-widest text-muted-foreground/40 uppercase">Ready to Shop</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {turns.map((turn) =>
                        turn.role === "user" ? (
                          <motion.div 
                            key={turn.id} 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 0.6, y: 0 }}
                            className="flex flex-col gap-1.5"
                          >
                             <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest ml-3">Intent</p>
                             <div className="ml-3 border-l-2 border-border pl-3 py-0.5">
                               <p className="text-[13px] font-medium text-foreground">{turn.content}</p>
                             </div>
                          </motion.div>
                        ) : (
                          <AssistantTurn key={turn.id} turn={turn} running={running} sessionId={sessionId} />
                        )
                      )}
                    </AnimatePresence>
                    <div ref={bottomRef} />
                  </div>
                )}
              </motion.section>

              <div className="hidden md:block w-px bg-border/40" />

              {/* RIGHT: SERVER AUTHORITY SIDEBAR */}
              <motion.aside variants={itemReveal} className="w-full md:w-[280px] flex flex-col gap-6 p-5 bg-muted/10">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] font-bold tracking-widest text-foreground uppercase">Server Authority</span>
                    <Badge variant="outline" className="h-4 px-1.5 text-[8px] font-bold text-copper border-copper/30 bg-copper/5">SERVER-AUTHORITATIVE</Badge>
                  </div>
                  
                  <div className="space-y-5">
                    <div>
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-2.5">Agent Can</p>
                      <p className="text-[11px] font-medium text-foreground/80 leading-relaxed">
                        Search · Inspect · Quote · Negotiate · Request checkout
                      </p>
                    </div>

                    <Separator className="bg-border/40" />

                    <div>
                      <p className="text-[9px] font-bold text-copper uppercase tracking-widest mb-2.5">Server Controls</p>
                      <p className="text-[11px] font-bold text-copper leading-relaxed">
                        Price · Discount · Inventory · Policy · State · Verification
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-border/40">
                  <h3 className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase mb-3">Guardrails</h3>
                  <ul className="space-y-2">
                    {[
                      "Registered tools only",
                      "Argument validation",
                      "Computed pricing",
                      "Server checkout",
                      "No auto-payment"
                    ].map(rule => (
                      <li key={rule} className="flex items-start gap-2 text-[10px] text-muted-foreground/70">
                        <Check className="size-3 text-verified-green/60 shrink-0 mt-0.5" />
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.aside>
            </motion.div>
          </div>
        </motion.div>

        {/* 5. YOUR ORDERS */}
        <motion.section variants={itemReveal} className="mt-8">
          <ActiveOrdersCard {...(workspace.data?.profile.full_name ? { buyerName: workspace.data.profile.full_name } : {})} />
        </motion.section>

        {/* 7. SESSION HISTORY */}
        <motion.section variants={itemReveal} className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <h2 className="text-lg font-bold text-foreground">Agent Sessions</h2>
            <History className="size-4 text-muted-foreground/40" />
          </div>
          
          <div className="bg-card border border-border/40 rounded-lg overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="bg-muted/30 border-b border-border/40">
                    <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Intent</th>
                    <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Time</th>
                    <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Tool Calls</th>
                    <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {sessions.isLoading ? (
                    <tr><td colSpan={4} className="px-5 py-6 text-center text-muted-foreground/50 text-xs">Loading sessions…</td></tr>
                  ) : (sessions.data?.length ?? 0) === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-6 text-center text-muted-foreground/50 text-xs">No sessions recorded</td></tr>
                  ) : (
                    sessions.data!.map((session, idx) => (
                      <motion.tr 
                        key={session.id} 
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.05 }}
                        className="hover:bg-muted/5 transition-colors"
                      >
                        <td className="px-5 py-3 font-medium text-foreground/80 max-w-[240px] truncate">
                          {session.title ?? "General Request"}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground/60 whitespace-nowrap text-xs">
                          {new Date(session.created_at).toLocaleString("en-IN", { 
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                          })}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground/60 whitespace-nowrap font-mono text-xs">
                          {session.total_tool_calls} calls
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant="outline" className="text-[8px] h-4 font-bold uppercase tracking-widest border-border/40 text-muted-foreground/60">
                            {session.status}
                          </Badge>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </motion.section>
      </motion.div>
    </AppShell>
  );
}

/* ------------------------------ assistant turn ----------------------------- */

function stepIcon(step: TraceStep) {
  if (step.status === "failed") return <AlertTriangle className="size-3.5 text-destructive" />;
  if (step.tool_name === "search_catalog") return <Search className="size-3.5 text-primary" />;
  if (step.tool_name === "get_quote" || step.tool_name === "get_current_quote")
    return <Receipt className="size-3.5 text-primary" />;
  if (step.tool_name === "propose_discount" || step.tool_name === "validate_offer")
    return <Handshake className="size-3.5 text-primary" />;
  if (step.tool_name === "get_eligible_related_products")
    return <Sparkles className="size-3.5 text-primary" />;

  if (step.tool_name) return <PackageCheck className="size-3.5 text-primary" />;
  return <Check className="size-3.5 text-primary" />;
}

/** Renders the model's plain answer: light markdown only, no HTML injection. */
function AssistantText({ content }: { content: string }) {
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  return (
    <>
      {lines.map((line, index) => {
        const clean = line.replace(/\*\*/g, "").replace(/^#+\s*/, "").trim();
        if (/^#+\s/.test(line)) {
          return (
            <p key={index} className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {clean}
            </p>
          );
        }
        if (/^[-*]\s/.test(line)) {
          return (
            <p key={index} className="flex gap-2">
              <span className="text-primary">•</span>
              <span>{clean.replace(/^[-*]\s*/, "")}</span>
            </p>
          );
        }
        return <p key={index}>{clean}</p>;
      })}
    </>
  );
}

function AssistantTurn({
  turn,
  running,
  sessionId,
}: {
  turn: Turn;
  running: boolean;
  sessionId: string | null;
}) {
  const [open, setOpen] = useState(true);
  const rec = turn.recommendation;
  const quote = rec?.quote?.quote ?? rec?.quote ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary border border-primary/20">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          {turn.steps.length > 0 ? (
            <div className="rounded-sm border border-border bg-card shadow-none overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/30 border-b border-border"
              >
                <span className="flex items-center gap-2">
                  {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  Agent activity
                  <span className="text-xs font-normal text-muted-foreground">
                    {turn.steps.length} steps
                  </span>
                </span>
                {running && !turn.meta?.status ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : null}
              </button>
              {open ? (
                <div className="space-y-3 px-4 py-4">
                  <AnimatePresence initial={false}>
                    {turn.steps.map((step, idx) => (
                      <motion.div 
                        key={step.step_number} 
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                        className={cn(
                          "flex items-center gap-3 text-sm transition-all duration-300",
                          running && idx === turn.steps.length - 1 ? "border-l-2 border-copper/50 pl-2 bg-copper/5 rounded-r" : ""
                        )}
                      >
                        <motion.span
                          animate={running && idx === turn.steps.length - 1 ? { scale: [1, 1.05, 1] } : {}}
                          transition={{ repeat: Infinity, duration: 2 }}
                        >
                          {stepIcon(step)}
                        </motion.span>
                        <span className="min-w-0 flex-1 truncate text-foreground">{step.label}</span>
                        {step.tool_name ? (
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {step.tool_name}
                          </code>
                        ) : null}
                        <AnimatePresence>
                          {step.latency_ms !== undefined && (
                            <motion.span 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="flex items-center gap-1 text-xs text-muted-foreground"
                            >
                              <Clock className="size-3" />
                              {step.latency_ms} ms
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : null}
            </div>
          ) : null}

          {turn.content ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="space-y-1.5 rounded-sm border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground shadow-none"
            >
              <AssistantText content={turn.content} />
            </motion.div>
          ) : running ? (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              className="text-sm text-muted-foreground"
            >
              Working…
            </motion.p>
          ) : null}

          {turn.notices.map((notice, index) => (
            <div
              key={`${notice.code}-${index}`}
              className="flex items-start gap-2 rounded-sm border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-foreground"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <span>
                <span className="font-medium">{notice.code}</span> — {notice.message}
              </span>
            </div>
          ))}

          {rec ? (
            <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border pb-3">
                <CardTitle className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <ShoppingBag className="size-3.5 text-primary" /> Recommended Product
                </CardTitle>
                <CardDescription className="text-xs">
                  Assembled from server tool results — authoritative figures only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{rec.product.name}</p>
                    {rec.product.category ? (
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {rec.product.category}
                      </p>
                    ) : null}
                    {rec.product.description ? (
                      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                        {rec.product.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-foreground">
                      {money(rec.product.price, rec.product.currency)}
                    </p>
                    <Badge variant={rec.product.in_stock ? "secondary" : "outline"} className="mt-1">
                      {rec.product.stock_status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>

                {quote ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-sm border border-border bg-muted/40 p-4 text-xs"
                  >
                    <p className="mb-3 flex items-center gap-2 font-bold uppercase tracking-widest text-foreground">
                      <Receipt className="size-3.5" /> Authority Quote
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-muted-foreground">
                      <dt>Quantity</dt>
                      <dd className="text-right text-foreground">{quote.quantity ?? "—"}</dd>
                      <dt>Base amount</dt>
                      <dd className="text-right text-foreground">
                        {money(quote.base_amount, quote.currency ?? rec.product.currency)}
                      </dd>
                      <dt>Discount applied</dt>
                      <dd className="text-right text-foreground">
                        {Number(quote.allowed_discount_percent ?? 0)}%
                      </dd>
                      <dt className="font-bold uppercase tracking-widest text-foreground">Final Total</dt>
                      <dd className="text-right font-bold font-mono text-primary">
                        {money(quote.final_amount, quote.currency ?? rec.product.currency)}
                      </dd>
                      {quote.requires_merchant_approval !== undefined ? (
                        <>
                          <dt>Merchant approval</dt>
                          <dd className="text-right text-foreground">
                            {quote.requires_merchant_approval ? "Required" : "Not required"}
                          </dd>
                        </>
                      ) : null}
                      {quote.expires_at ? (
                        <>
                          <dt>Quote expires</dt>
                          <dd className="text-right text-foreground">
                            {new Date(quote.expires_at).toLocaleTimeString("en-IN")}
                          </dd>
                        </>
                      ) : null}
                    </dl>
                  </motion.div>
                ) : rec.quote_error ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                    No valid quote was returned ({rec.quote_error.code}), so no price is estimated.
                  </div>
                ) : null}

                {rec.negotiation ? <NegotiationPanel outcome={rec.negotiation} /> : null}

                <CheckoutSection
                  result={rec.checkout ?? null}
                  quoteId={quote?.quote_id ?? null}
                  sessionId={sessionId}
                />

                {rec.growth && rec.growth.length > 0 ? (
                  <>
                    <Separator />
                    <GrowthPicks picks={rec.growth} />
                  </>
                ) : null}

                {rec.related.length > 0 ? (
                  <>
                    <Separator />
                    <div>
                      <p className="mb-2 text-sm font-medium text-foreground">Related</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {rec.related.map((item) => (
                          <div
                            key={item.product_id}
                            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                          >
                            <span className="min-w-0 truncate text-foreground">{item.name}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {money(item.price, item.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

              </CardContent>
            </Card>
          ) : null}

          {turn.meta?.status ? (
            <p className="text-xs text-muted-foreground">
              {turn.meta.model} · {turn.meta.step_count} steps · {turn.meta.tool_call_count} tool
              calls · {turn.meta.duration_ms} ms
              {turn.meta.total_tokens ? ` · ${turn.meta.total_tokens} tokens` : ""}
              {turn.meta.stop_reason ? ` · ${turn.meta.stop_reason}` : ""}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- checkout --------------------------------- */

const CHECKOUT_TIMELINE: CheckoutState[] = [
  "CHECKOUT_REQUESTED",
  "APPROVAL_REQUIRED",
  "APPROVED",
  "ORDER_CREATED",
  "PAYMENT_PENDING",
  "PAYMENT_CAPTURED",
  "COMPLETED",
];


/**
 * Checkout affordance + live order state. The client sends only a quote id and
 * an idempotency key: every amount, the approval requirement and the status come
 * back from the server.
 */
function CheckoutSection({
  result,
  quoteId,
  sessionId,
}: {
  result: CheckoutToolResult | null;
  quoteId: string | null;
  sessionId: string | null;
}) {
  const startCheckout = useServerFn(requestBuyerCheckout);
  const fetchOrderStatus = useServerFn(getOrderStatus);
  const [pending, setPending] = useState(false);
  const [local, setLocal] = useState<CheckoutToolResult | null>(null);
  const outcome = result ?? local;
  const orderId = outcome?.order?.order_id ?? null;

  const live = useQuery({
    queryKey: ["order-status", orderId],
    queryFn: () => fetchOrderStatus({ data: { orderId: orderId! } }),
    enabled: Boolean(orderId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "APPROVAL_REQUIRED" || status === "PAYMENT_PENDING" || status === "PAYMENT_CAPTURED"
        ? 4000
        : false;
    },
  });


  async function handleCheckout() {
    if (!quoteId || !sessionId) return;
    setPending(true);
    try {
      const response = await startCheckout({
        data: {
          quote_id: quoteId,
          session_id: sessionId,
          idempotency_key: `ui-${sessionId.replace(/-/g, "").slice(0, 12)}-${quoteId.replace(/-/g, "").slice(0, 12)}`,
        },
      });
      setLocal(
        response.ok
          ? {
              checkout_created: true,
              idempotent_replay: response.idempotent_replay,
              order: response.order as NonNullable<CheckoutToolResult["order"]>,
              trace: response.trace,
            }
          : {
              checkout_created: false,
              error_code: response.error.code,
              reason: response.error.message,
              trace: response.trace,
            },
      );
    } catch (error) {
      setLocal({
        checkout_created: false,
        error_code: "checkout_failed",
        reason: error instanceof Error ? error.message : "Checkout could not be completed.",
      });
    } finally {
      setPending(false);
    }
  }

  if (!outcome) {
    if (!quoteId) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          Ready to buy? The server re-checks stock, policy and the quote before creating an order.
        </p>
        <Button size="sm" onClick={handleCheckout} disabled={pending || !sessionId}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <ShoppingBag className="size-4" />}
          Proceed to checkout
        </Button>
      </div>
    );
  }

  if (!outcome.checkout_created) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-foreground">Checkout refused by the server</p>
        <p className="mt-1 text-muted-foreground">
          {outcome.reason ?? "The server declined this checkout."}
          {outcome.error_code ? ` (${outcome.error_code})` : ""}
        </p>
      </div>
    );
  }

  const order = outcome.order!;
  const status = (live.data?.status ?? order.status) as CheckoutState;
  const currency = order.currency;
  const activeIndex = CHECKOUT_TIMELINE.indexOf(status);
  const terminal = status === "REJECTED" || status === "CANCELLED" || status === "EXPIRED";

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <PackageCheck className="size-4" /> Checkout
        </p>
        <Badge variant={terminal ? "outline" : "secondary"}>{CHECKOUT_STATE_LABELS[status]}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
        <dt>Product</dt>
        <dd className="text-right text-foreground">
          {live.data?.product_name ?? order.product_name ?? "—"}
          {order.quantity ? ` × ${order.quantity}` : ""}
        </dd>
        <dt>Subtotal</dt>
        <dd className="text-right text-foreground">{money(order.subtotal_amount, currency)}</dd>
        <dt>Discount</dt>
        <dd className="text-right text-foreground">−{money(order.discount_amount, currency)}</dd>
        <dt className="font-medium text-foreground">Order total</dt>
        <dd className="text-right font-semibold text-foreground">
          {money(order.final_amount, currency)}
        </dd>
      </dl>




      {!terminal ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CHECKOUT_TIMELINE.filter(
            (state) => state !== "APPROVAL_REQUIRED" || order.approval_required,
          ).map((state) => {
            const reached = activeIndex >= CHECKOUT_TIMELINE.indexOf(state);
            return (
              <span
                key={state}
                className={
                  reached
                    ? "rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
                    : "rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                }
              >
                {CHECKOUT_STATE_LABELS[state]}
              </span>
            );
          })}
        </div>
      ) : null}

      {status === "APPROVAL_REQUIRED" ? (
        <p className="mt-3 flex items-start gap-2 text-muted-foreground">
          <Clock className="mt-0.5 size-4 shrink-0" />
          <span>
            This checkout requires merchant approval because the order value exceeds the merchant&apos;s
            automatic approval threshold. Waiting for the merchant to review.
          </span>
        </p>
      ) : null}

      {status === "REJECTED" ? (
        <p className="mt-3 text-muted-foreground">
          The merchant rejected this order{live.data?.approval_reason ? `: ${live.data.approval_reason}` : "."}
        </p>
      ) : null}

      {["PAYMENT_PENDING", "PAYMENT_CAPTURED", "COMPLETED"].includes(status) ? (
        <PaymentPanel
          orderId={order.order_id}
          orderStatus={status}
          amount={live.data?.final_amount ?? order.final_amount}
          currency={currency}
        />
      ) : null}

      {outcome.idempotent_replay ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Idempotent replay — the existing order was returned instead of creating a duplicate.
        </p>
      ) : null}

    </div>
  );
}

/* ------------------------- negotiation + growth cards ---------------------- */

/** Every figure here comes from the server's policy engine, never model text. */
function NegotiationPanel({ outcome }: { outcome: NegotiationOutcome }) {
  const tone =
    outcome.decision === "accept"
      ? "border-primary/40 bg-primary/5"
      : outcome.decision === "counter"
        ? "border-border bg-muted/40"
        : "border-destructive/40 bg-destructive/5";
  return (
    <div className={`rounded-md border p-3 text-sm ${tone}`}>
      <p className="mb-2 flex flex-wrap items-center gap-2 font-medium text-foreground">
        <Handshake className="size-4" /> Negotiation
        <Badge variant={outcome.decision === "reject" ? "outline" : "secondary"}>
          {outcome.decision === "accept"
            ? "Accepted"
            : outcome.decision === "counter"
              ? "Counter-offer"
              : "Declined"}
        </Badge>
        {outcome.negotiation_available ? (
          <span className="text-xs font-normal text-muted-foreground">
            Round {outcome.round_number} · {outcome.rounds_remaining} left
          </span>
        ) : (
          <span className="text-xs font-normal text-muted-foreground">
            Negotiation disabled by merchant policy
          </span>
        )}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
        <dt>Requested discount</dt>
        <dd className="text-right text-foreground">{outcome.requested_discount_percent}%</dd>
        <dt>Policy maximum</dt>
        <dd className="text-right text-foreground">{outcome.policy_limit_percent}%</dd>
        <dt className="font-medium text-foreground">Approved discount</dt>
        <dd className="text-right font-semibold text-foreground">
          {outcome.approved_discount_percent}%
        </dd>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">{outcome.policy_reason}</p>
    </div>
  );
}

function GrowthPicks({ picks }: { picks: GrowthPick[] }) {
  const accept = useServerFn(acceptRecommendation);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string | null>(null);

  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <Sparkles className="size-4 text-primary" /> You may also want
      </p>
      <div className="grid gap-2">
        {picks.map((pick) => {
          const key = pick.recommendation_id ?? pick.product_id;
          const isAccepted = Boolean(accepted[key]);
          return (
            <div key={key} className="rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-foreground">{pick.name}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {pick.recommendation_type.replace("_", " ")}
                  </Badge>
                  <span className="text-muted-foreground">{money(pick.price, pick.currency)}</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{pick.reason}</p>
              {pick.recommendation_id ? (
                <Button
                  size="sm"
                  variant={isAccepted ? "secondary" : "outline"}
                  className="mt-2 h-7"
                  disabled={isAccepted || pending === key}
                  onClick={async () => {
                    setPending(key);
                    try {
                      await accept({ data: { recommendationId: pick.recommendation_id! } });
                      setAccepted((prev) => ({ ...prev, [key]: true }));
                    } catch {
                      /* keep the button available on failure */
                    } finally {
                      setPending(null);
                    }
                  }}
                >
                  {isAccepted ? (
                    <>
                      <Check className="size-3.5" /> Added to interest
                    </>
                  ) : pending === key ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Saving
                    </>
                  ) : (
                    "I'm interested"
                  )}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* --------------------------- persisted buyer orders ------------------------ */

/**
 * Chat turns live in component state, so a buyer who leaves the page (e.g. to watch
 * the merchant approve) loses the in-memory checkout card. This card reads the
 * buyer's persisted orders back from the server so payment can always be resumed.
 */
function ActiveOrdersCard({ buyerName }: { buyerName?: string }) {
  const fetchOrders = useServerFn(getMyActiveOrders);
  const orders = useQuery({
    queryKey: ["buyer-active-orders"],
    queryFn: () => fetchOrders(),
    refetchInterval: 10_000,
  });

  const rows = orders.data ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <h2 className="text-sm font-bold text-foreground">Active Orders</h2>
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground uppercase tracking-widest font-bold">
          <Clock className="size-3" />
          <span>Server-Side Persistence</span>
        </div>
      </div>
      
      <div className="bg-card border border-border/40 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-muted/30 border-b border-border/40">
                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Product</th>
                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Order</th>
                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Amount</th>
                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Status</th>
                <th className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {rows.map((row: BuyerActiveOrder, idx: number) => (
                <motion.div 
                  key={row.order_id} 
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.05 }}
                  style={{ display: 'contents' }}
                >
                  <OrderRow row={row} buyerName={buyerName ?? undefined} />
                </motion.div>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function OrderRow({ row, buyerName }: { row: BuyerActiveOrder; buyerName: string | undefined }) {
  const [expanded, setExpanded] = useState(false);
  const isCompleted = row.status === "COMPLETED";

  return (
    <>
      <tr 
        className={cn(
          "group transition-colors",
          expanded ? "bg-muted/20" : "hover:bg-muted/10 cursor-pointer"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-5 py-3">
          <div className="flex items-center gap-2.5">
            <PackageCheck className={cn("size-3.5", isCompleted ? "text-verified-green" : "text-muted-foreground/40")} />
            <span className="font-medium text-foreground/80">
              {row.product_name ?? "Product"}
              {row.quantity ? ` × ${row.quantity}` : ""}
            </span>
          </div>
        </td>
        <td className="px-5 py-3 font-mono text-[10px] text-muted-foreground/50">
          {row.order_id.slice(0, 8)}
        </td>
        <td className="px-5 py-3 font-mono font-bold text-foreground/90">
          {new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: row.currency,
            maximumFractionDigits: 0,
          }).format(row.final_amount)}
        </td>
        <td className="px-5 py-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={row.status}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <Badge variant={isCompleted ? "secondary" : "outline"} className={cn(
                "text-[8px] h-4 font-bold uppercase tracking-widest border-border/40",
                row.status === "COMPLETED" && "bg-verified-green/10 text-verified-green border-verified-green/20",
                row.status === "PAYMENT_PENDING" && "bg-approval-amber/10 text-approval-amber border-approval-amber/20",
                row.status === "APPROVAL_REQUIRED" && "bg-muted text-muted-foreground border-border/40"
              )}>
                {isCompleted && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="mr-1"
                  >
                    <Check className="size-2.5" />
                  </motion.span>
                )}
                {CHECKOUT_STATE_LABELS[row.status] ?? row.status}
              </Badge>
            </motion.div>
          </AnimatePresence>
        </td>
        <td className="px-5 py-3 text-muted-foreground/60 whitespace-nowrap text-[11px]">
          {new Date(row.created_at).toLocaleDateString("en-IN", { month: 'short', day: 'numeric' })}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="px-6 py-6 bg-muted/20 border-b border-border/40">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <h4 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2.5">Server Authority Information</h4>
                  <div className="bg-background/40 rounded border border-border/40 p-3 space-y-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground/60">Verification Time</span>
                      <span className="text-foreground/80 font-mono">{new Date(row.created_at).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground/60">Payment State</span>
                      <span className="text-foreground/80 font-bold uppercase tracking-tight">{row.status.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                </div>

                {row.status === "APPROVAL_REQUIRED" ? (
                  <div className="flex items-start gap-2.5 p-3 bg-approval-amber/5 border border-approval-amber/20 rounded">
                    <Clock className="size-3.5 text-approval-amber shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[9px] font-bold text-approval-amber uppercase tracking-widest">Waiting for merchant approval</p>
                      <p className="text-[10px] text-approval-amber/70 mt-1 leading-tight">Order value exceeds automatic threshold. Audit pending.</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Payment Control</h4>
                {["PAYMENT_PENDING", "PAYMENT_CAPTURED", "COMPLETED"].includes(row.status) ? (
                  <div className="bg-background/50 rounded border border-border/60 p-3">
                    <PaymentPanel
                      orderId={row.order_id}
                      orderStatus={row.status}
                      amount={row.final_amount}
                      currency={row.currency}
                      {...(buyerName ? { buyerName } : {})}
                    />
                  </div>
                ) : (
                  <div className="p-4 border border-dashed border-border/60 rounded flex flex-col items-center justify-center text-center">
                    <Clock className="size-6 text-muted-foreground/20 mb-2" />
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Transaction Locked</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">Awaiting authority state transition.</p>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
