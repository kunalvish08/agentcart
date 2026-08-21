import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
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
  User,

} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { PaymentPanel } from "@/components/PaymentPanel";

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

  return (
    <AppShell
      title="AI Buyer"
      subtitle="A bounded tool-using shopping agent. It can request checkout, but never approves or pays."
      accountLabel={merchant?.name}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="border-dashed">
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Bot className="size-4" /> Tools: search · product · quote · policy · negotiate · checkout ·
                growth

              </span>
              <span>Max 10 steps</span>
              <span>Max 20 tool calls</span>
              <span>Pricing authority: server</span>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            {turns.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ask for what you need</CardTitle>
                  <CardDescription>
                    The agent searches the live TechNova catalog, inspects the strongest match and
                    asks the server for an authoritative quote. It never invents products or prices.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} variant="outline" size="sm" onClick={() => void send(s)}>
                      {s}
                    </Button>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {turns.map((turn) =>
              turn.role === "user" ? (
                <div key={turn.id} className="flex justify-end">
                  <div className="flex max-w-[85%] items-start gap-3 rounded-lg rounded-tr-none bg-secondary px-4 py-3 text-sm text-secondary-foreground">
                    <span className="whitespace-pre-wrap">{turn.content}</span>
                    <User className="mt-0.5 size-4 shrink-0 opacity-60" />
                  </div>
                </div>
              ) : (
                <AssistantTurn key={turn.id} turn={turn} running={running} sessionId={sessionId} />
              ),
            )}
            <div ref={bottomRef} />
          </div>

          <Card className="sticky bottom-4 shadow-sm">
            <CardContent className="flex items-end gap-3 py-4">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="e.g. I need a coding laptop under ₹60,000."
                rows={2}
                className="min-h-[52px] resize-none"
                disabled={running}
              />
              {running ? (
                <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Stop
                </Button>
              ) : (
                <Button onClick={() => void send(input)} disabled={!input.trim()}>
                  <Send className="mr-2 size-4" />
                  Ask
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4" /> Session history
              </CardTitle>
              <CardDescription>Persisted agent runs for this account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sessions.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (sessions.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No agent sessions yet.</p>
              ) : (
                sessions.data!.map((session) => (
                  <div key={session.id} className="rounded-md border border-border px-3 py-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {session.title ?? "Untitled request"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(session.created_at).toLocaleString("en-IN")} · {session.runs} run
                      {session.runs === 1 ? "" : "s"} · {session.total_tool_calls} tool calls
                    </p>
                    <Badge variant="outline" className="mt-2 text-xs">
                      {session.status}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Guardrails</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>· Model reaches the catalog only through registered, validated tools.</p>
              <p>· Every tool argument is re-validated server-side.</p>
              <p>· Prices, discounts and policy caps are computed by the quote API.</p>
              <p>· Checkout amounts are copied from the server quote; the agent cannot approve.</p>
              <p>· No payment is captured in this phase — orders stop at payment pending.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
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
        <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          {turn.steps.length > 0 ? (
            <div className="rounded-lg border border-border bg-card">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium"
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
                <div className="space-y-2 border-t border-border px-4 py-3">
                  {turn.steps.map((step) => (
                    <div key={step.step_number} className="flex items-center gap-3 text-sm">
                      {stepIcon(step)}
                      <span className="min-w-0 flex-1 truncate text-foreground">{step.label}</span>
                      {step.tool_name ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {step.tool_name}
                        </code>
                      ) : null}
                      {step.latency_ms !== undefined ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {step.latency_ms} ms
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {turn.content ? (
            <div className="space-y-1.5 rounded-lg border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground">
              <AssistantText content={turn.content} />
            </div>
          ) : running ? (
            <p className="text-sm text-muted-foreground">Working…</p>
          ) : null}

          {turn.notices.map((notice, index) => (
            <div
              key={`${notice.code}-${index}`}
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-foreground"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                <span className="font-medium">{notice.code}</span> — {notice.message}
              </span>
            </div>
          ))}

          {rec ? (
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingBag className="size-4 text-primary" /> Recommended product
                </CardTitle>
                <CardDescription>
                  Assembled from server tool results — never model-generated figures.
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
                  <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                    <p className="mb-2 flex items-center gap-2 font-medium text-foreground">
                      <Receipt className="size-4" /> Server-calculated quote
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
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
                      <dt className="font-medium text-foreground">Final amount</dt>
                      <dd className="text-right font-semibold text-foreground">
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
                  </div>
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

