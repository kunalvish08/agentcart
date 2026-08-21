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
  History,
  Loader2,
  PackageCheck,
  Receipt,
  Search,
  Send,
  ShoppingBag,
  User,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { listAgentSessions } from "@/lib/agent.functions";
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

type Recommendation = {
  product: ProductCard;
  related: ProductCard[];
  quote: any | null;
  quote_error: { code: string; message: string } | null;
  searched_count: number | null;
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
  "Find me something under ₹1,000.",
  "Give me the DeveloperBook Pro 15 with a quote for 1 unit.",
  "Buy me a quantum teleporter.",
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
      subtitle="A bounded tool-using shopping agent. Read + quote only — it cannot order or pay."
      accountLabel={merchant?.name}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="border-dashed">
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Bot className="size-4" /> Tools: search · product · related · quote · merchant
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
                <AssistantTurn key={turn.id} turn={turn} running={running} />
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
              <p>· Model reaches the catalog only through 5 registered tools.</p>
              <p>· Every tool argument is re-validated server-side.</p>
              <p>· Prices, discounts and policy caps are computed by the quote API.</p>
              <p>· No checkout, payments or negotiation in this phase.</p>
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
  if (step.tool_name === "get_quote") return <Receipt className="size-3.5 text-primary" />;
  if (step.tool_name) return <PackageCheck className="size-3.5 text-primary" />;
  return <Check className="size-3.5 text-primary" />;
}

function AssistantTurn({ turn, running }: { turn: Turn; running: boolean }) {
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
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground">
              {turn.content}
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
