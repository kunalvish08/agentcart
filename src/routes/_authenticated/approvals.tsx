import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ClipboardCheck, Loader2, ScrollText, X } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { PaymentLedgerCard } from "@/components/PaymentLedgerCard";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CHECKOUT_STATE_LABELS, type CheckoutState } from "@/lib/checkout-state";
import {
  getApprovalQueue,
  getCheckoutAudit,
  reviewCheckoutApproval,
  type ApprovalQueueRow,
} from "@/lib/checkout.functions";
import { getWorkspace } from "@/lib/merchant.functions";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "Checkout approvals · Agentic Commerce Console" },
      {
        name: "description",
        content:
          "Human-in-the-loop queue where a merchant approves or rejects agent-initiated checkouts, with a full server-side audit trail.",
      },
      { property: "og:title", content: "Checkout approvals · Agentic Commerce Console" },
      {
        property: "og:description",
        content: "Approve or reject agentic checkouts with server-enforced state transitions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApprovalsPage,
});

function money(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function ApprovalsPage() {
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(getWorkspace);
  const fetchQueue = useServerFn(getApprovalQueue);
  const fetchAudit = useServerFn(getCheckoutAudit);
  const review = useServerFn(reviewCheckoutApproval);

  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => fetchWorkspace() });
  const queue = useQuery({
    queryKey: ["approval-queue"],
    queryFn: () => fetchQueue(),
    refetchInterval: 10_000,
  });
  const audit = useQuery({ queryKey: ["checkout-audit"], queryFn: () => fetchAudit() });

  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: { orderId: string; decision: "approve" | "reject"; reason?: string }) =>
      review({
        data: {
          order_id: input.orderId,
          decision: input.decision,
          ...(input.reason ? { rejection_reason: input.reason } : {}),
        },
      }),
    onSuccess: (result, input) => {
      toast.success(
        input.decision === "approve"
          ? `Order approved — now ${CHECKOUT_STATE_LABELS[result.status as CheckoutState]}`
          : "Order rejected",
      );
      void queryClient.invalidateQueries({ queryKey: ["approval-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["checkout-audit"] });
      void queryClient.invalidateQueries({ queryKey: ["checkout-metrics"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not record the decision"),
    onSettled: () => setActiveId(null),
  });

  const rows = queue.data ?? [];
  const pending = rows.filter((row) => row.status === "pending");
  const reviewed = rows.filter((row) => row.status !== "pending");

  return (
    <AppShell
      title="Checkout approvals"
      subtitle="Human-in-the-loop review — the agent can request a checkout but never approve one"
      accountLabel={workspace.data?.profile.email ?? undefined}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="size-4 text-primary" /> Pending approval
                <Badge variant="secondary">{pending.length}</Badge>
              </CardTitle>
              <CardDescription>
                Orders whose value exceeds your automatic approval threshold. Amounts are copied from
                the server quote and cannot be edited here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {queue.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading queue…
                </p>
              ) : pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing waiting on you. Agentic checkouts under your threshold are created
                  automatically.
                </p>
              ) : (
                pending.map((row) => (
                  <div key={row.approval_id} className="rounded-lg border border-border p-4">
                    <OrderSummary row={row} />

                    {row.reason ? (
                      <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                        <span>{row.reason}</span>
                      </p>
                    ) : null}

                    <Textarea
                      value={reasons[row.approval_id] ?? ""}
                      onChange={(event) =>
                        setReasons((prev) => ({ ...prev, [row.approval_id]: event.target.value }))
                      }
                      placeholder="Reason (required when rejecting)"
                      maxLength={500}
                      rows={2}
                      className="mt-3"
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={mutation.isPending}
                        onClick={() => {
                          setActiveId(row.approval_id);
                          mutation.mutate({ orderId: row.order_id, decision: "approve" });
                        }}
                      >
                        {mutation.isPending && activeId === row.approval_id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Check className="size-4" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutation.isPending}
                        onClick={() => {
                          const reason = (reasons[row.approval_id] ?? "").trim();
                          if (!reason) {
                            toast.error("Add a reason before rejecting this order");
                            return;
                          }
                          setActiveId(row.approval_id);
                          mutation.mutate({ orderId: row.order_id, decision: "reject", reason });
                        }}
                      >
                        <X className="size-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recently reviewed</CardTitle>
              <CardDescription>Decisions are immutable once recorded.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviewed.length === 0 ? (
                <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
              ) : (
                reviewed.slice(0, 10).map((row) => (
                  <div key={row.approval_id} className="rounded-sm border border-border bg-muted/20 p-6">
                    <OrderSummary row={row} />
                    <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                      <div className="flex items-center gap-2">
                        <div className={cn("size-1.5 rounded-full", row.status === "approved" ? "bg-verified-green" : "bg-destructive")} />
                        <span className={cn("text-[10px] font-bold uppercase tracking-tight", row.status === "approved" ? "text-verified-green" : "text-destructive")}>
                          {row.status}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-muted-foreground/60">
                        {row.reviewed_at
                          ? new Date(row.reviewed_at).toLocaleString("en-IN")
                          : ""}
                      </p>
                    </div>
                    {row.rejection_reason && (
                      <p className="mt-2 text-xs text-muted-foreground italic border-l-2 border-destructive/20 pl-3 py-1">
                        Reason: {row.rejection_reason}
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <PaymentLedgerCard />

          <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border pb-4">
              <CardTitle className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <ScrollText className="size-3.5" /> Checkout audit trail
              </CardTitle>
              <CardDescription className="text-xs">
                Immutable server log of every state change and decision.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-3">
              {audit.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading events…
                </p>
              ) : (audit.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No checkout events yet.</p>
              ) : (
                (audit.data ?? []).map((event) => (
                  <div key={event.id} className="rounded-sm border border-border bg-muted/20 px-3 py-3 text-[10px]">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-bold text-foreground uppercase tracking-tight">{event.event.replace(/_/g, ' ')}</span>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-primary/60 px-1.5 py-0.5 rounded-sm bg-primary/5 border border-primary/10">
                        {event.actor_type}
                      </span>
                    </div>
                    <div className="font-mono text-muted-foreground/80 flex items-center gap-2 mb-2">
                      <span className="text-[9px]">{event.from_status || 'START'}</span>
                      <ArrowRight className="size-2.5" />
                      <span className="text-[9px] text-foreground">{event.to_status ?? "—"}</span>
                    </div>
                    {event.reason ? (
                      <p className="mb-2 text-muted-foreground italic border-l border-border/60 pl-2">
                        {event.reason}
                      </p>
                    ) : null}
                    <p className="text-[9px] font-mono text-muted-foreground/40 text-right">
                      {new Date(event.created_at).toLocaleString("en-IN")}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border pb-4">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Authority Model</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-3 text-[11px] text-muted-foreground leading-relaxed">
              <p>· The AI agent may request checkout; only you can approve or reject.</p>
              <p>· Order amounts are copied from the server quote, never from the model.</p>
              <p>· Illegal state transitions are rejected by a database trigger.</p>
              <p>
                · Payments run in Razorpay test mode and only a server-verified signature can
                complete an order — the AI can never mark a payment successful.
              </p>
            </CardContent>
          </Card>

        </aside>
      </div>
    </AppShell>
  );
}

function OrderSummary({ row }: { row: ApprovalQueueRow }) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight text-foreground">
            {row.product_name ?? "Product"}
            {row.quantity ? ` × ${row.quantity}` : ""}
          </p>
          <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
            Order {row.order_id.slice(0, 8)} · requested{" "}
            {new Date(row.requested_at).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold tracking-tight text-foreground font-mono">
            {money(row.final_amount, row.currency)}
          </p>
          <span className="mt-1.5 inline-block text-[9px] font-bold uppercase tracking-widest text-primary px-1.5 py-0.5 rounded-sm bg-primary/5 border border-primary/10">
            {CHECKOUT_STATE_LABELS[row.order_status] ?? row.order_status}
          </span>
        </div>
      </div>

      <Separator className="my-4 bg-border/40" />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <dt>Subtotal</dt>
        <dd className="text-right text-foreground font-mono">{money(row.subtotal_amount, row.currency)}</dd>
        <dt>Discount</dt>
        <dd className="text-right text-verified-green font-mono">−{money(row.discount_amount, row.currency)}</dd>
      </dl>

      {row.customer_request_summary ? (
        <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed italic border-l-2 border-border/60 pl-3">
          Customer: {row.customer_request_summary}
        </p>
      ) : null}
      {row.negotiation_summary ? (
        <p className="mt-2 text-[11px] text-primary/80 leading-relaxed italic border-l-2 border-primary/20 pl-3">
          Negotiation: {row.negotiation_summary}
        </p>
      ) : null}
    </>
  );
}
