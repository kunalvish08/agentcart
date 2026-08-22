import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, History, CreditCard, ScrollText, Info } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { PaymentLedgerCard } from "@/components/PaymentLedgerCard";

import { CHECKOUT_STATE_LABELS, type CheckoutState } from "@/lib/checkout-state";
import {
  getApprovalQueue,
  getCheckoutAudit,
  reviewCheckoutApproval,
} from "@/lib/checkout.functions";
import { getWorkspace } from "@/lib/merchant.functions";
import { ApprovalsHeader } from "@/components/approvals/ApprovalsHeader";
import { ApprovalCard } from "@/components/approvals/ApprovalCard";
import { AuditTrail } from "@/components/approvals/AuditTrail";
import { QueueControls } from "@/components/approvals/QueueControls";
import { cn } from "@/lib/utils";

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
  const [page, setPage] = useState(0);
  const limit = 10;

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
  
  const totalPendingValue = pending.reduce((sum, row) => sum + row.final_amount, 0);
  const paginatedPending = pending.slice(page * limit, (page + 1) * limit);

  return (
    <AppShell
      title="Checkout approvals"
      subtitle="Human-in-the-loop review — the agent can request a checkout but never approve one"
      accountLabel={workspace.data?.profile.email ?? undefined}
    >
      <div className="space-y-12 w-full max-w-full min-w-0 pb-24">
        {/* HEADER & SUMMARY */}
        <ApprovalsHeader 
          pendingCount={pending.length} 
          email={workspace.data?.profile.email}
          totalPendingValue={totalPendingValue}
        />

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-16">
            {/* 3. ACTIVE APPROVAL QUEUE */}
            <section className="space-y-6">
              <div className="flex flex-col gap-1 border-b border-border/40 pb-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                    <ShieldCheck className="size-3.5 text-primary" /> Active Approval Queue
                  </h2>
                  <span className="text-[9px] font-mono text-muted-foreground/40 tracking-widest">SERVER-AUTHORITATIVE</span>
                </div>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-tight">
                  Orders above the merchant's automatic approval threshold.
                </p>
              </div>
              
              <div className="space-y-px bg-border/20 border border-border/20">
                {queue.isLoading ? (
                  <div className="bg-background p-12 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest animate-pulse">
                      Synchronizing authority queue...
                    </p>
                  </div>
                ) : pending.length === 0 ? (
                  <div className="bg-background p-12 text-center border-dashed border border-border/40">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                      Queue clear. Agentic checkouts under threshold are created automatically.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-px">
                      {paginatedPending.map((row) => (
                        <ApprovalCard
                          key={row.approval_id}
                          row={row}
                          isPending={mutation.isPending}
                          isActive={activeId === row.approval_id}
                          reason={reasons[row.approval_id] ?? ""}
                          onReasonChange={(val) => setReasons(prev => ({ ...prev, [row.approval_id]: val }))}
                          onApprove={(orderId) => {
                            setActiveId(row.approval_id);
                            mutation.mutate({ orderId, decision: "approve" });
                          }}
                          onReject={(orderId, r) => {
                            setActiveId(row.approval_id);
                            mutation.mutate({ orderId, decision: "reject", reason: r });
                          }}
                        />
                      ))}
                    </div>
                    <div className="bg-background p-4">
                      <QueueControls 
                        total={pending.length}
                        offset={page * limit}
                        limit={limit}
                        onPageChange={(newOffset) => setPage(newOffset / limit)}
                      />
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* 7. RECENTLY REVIEWED */}
            <section className="space-y-6">
              <div className="flex items-center justify-between border-b border-border/40 pb-4">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
                  <History className="size-3.5" /> Recently Reviewed
                </h2>
                <span className="text-[9px] font-mono text-muted-foreground/20 italic tracking-widest">IMMUTABLE DECISIONS</span>
              </div>
              
              <div className="w-full overflow-x-auto no-scrollbar border border-border/40">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border/40">
                      <th className="p-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Product</th>
                      <th className="p-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Order</th>
                      <th className="p-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 text-right">Amount</th>
                      <th className="p-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Decision</th>
                      <th className="p-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {reviewed.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-[10px] text-muted-foreground uppercase tracking-widest">
                          No decisions recorded yet.
                        </td>
                      </tr>
                    ) : (
                      reviewed.slice(0, 5).map((row) => (
                        <tr key={row.approval_id} className="bg-background hover:bg-muted/5 transition-colors">
                          <td className="p-3">
                            <p className="text-[10px] font-bold text-foreground uppercase truncate max-w-[150px]">
                              {row.product_name}
                            </p>
                          </td>
                          <td className="p-3">
                            <p className="text-[9px] font-mono text-muted-foreground/60 uppercase">
                              {row.order_id.slice(0, 8)}
                            </p>
                          </td>
                          <td className="p-3 text-right">
                            <p className="text-[10px] font-mono font-bold text-foreground">
                              {money(row.final_amount, row.currency)}
                            </p>
                          </td>
                          <td className="p-3">
                            <span className={cn(
                              "text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 border",
                              row.status === "approved" 
                                ? "text-verified-green bg-verified-green/5 border-verified-green/20"
                                : "text-destructive bg-destructive/5 border-destructive/20"
                            )}>
                              {row.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <p className="text-[8px] font-mono text-muted-foreground/40">
                              {row.reviewed_at ? new Date(row.reviewed_at).toLocaleDateString("en-IN", { day: '2-digit', month: 'short' }) : "—"}
                            </p>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="space-y-12">
            {/* 8. PAYMENTS */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                <CreditCard className="size-3.5 text-muted-foreground/60" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Payments</h2>
              </div>
              <PaymentLedgerCard />
            </section>

            {/* 9. CHECKOUT AUDIT TRAIL */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                <ScrollText className="size-3.5 text-muted-foreground/60" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Audit Trail</h2>
              </div>
              <AuditTrail 
                events={audit.data ?? []} 
                isLoading={audit.isLoading} 
              />
            </section>

            {/* 10. AUTHORITY MODEL */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                <Info className="size-3.5 text-copper-500/60" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Authority Model</h2>
              </div>
              <div className="bg-card border border-border/40 p-5 space-y-4 text-[10px] text-muted-foreground leading-relaxed">
                <ul className="space-y-3">
                  <li className="flex gap-3">
                    <span className="text-copper-500 font-bold">01</span>
                    <span>The AI agent may request checkout; only the merchant can approve or reject.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-copper-500 font-bold">02</span>
                    <span>Order amounts come from the server-authoritative quote.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-copper-500 font-bold">03</span>
                    <span>Illegal state transitions are rejected server-side.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-copper-500 font-bold">04</span>
                    <span>Payment completion requires server-side Razorpay verification.</span>
                  </li>
                </ul>
                <div className="pt-4 border-t border-border/20">
                  <p className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-widest text-center">
                    Agentic Commerce Protocol v1.0
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
