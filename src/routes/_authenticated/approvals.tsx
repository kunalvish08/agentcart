import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* 1. PAGE HEADER & 2. PENDING APPROVAL SUMMARY */}
        <ApprovalsHeader pendingCount={pending.length} />

        <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
          <div className="space-y-8">
            {/* 3. APPROVAL REQUEST LIST & 4, 5, 6, 7. APPROVAL REQUEST CARD */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="size-3.5" /> Active Approval Queue
                </h2>
                <span className="text-[9px] font-mono text-muted-foreground/40">SERVER-AUTHORITATIVE</span>
              </div>
              
              <div className="space-y-4">
                {queue.isLoading ? (
                  <Card className="rounded-sm border-border bg-card/50">
                    <CardContent className="p-8 text-center text-[10px] text-muted-foreground uppercase tracking-widest">
                      Loading authority queue...
                    </CardContent>
                  </Card>
                ) : pending.length === 0 ? (
                  <Card className="rounded-sm border-border bg-card/50 border-dashed">
                    <CardContent className="p-8 text-center text-[10px] text-muted-foreground uppercase tracking-widest">
                      Nothing waiting on you. Agentic checkouts under threshold are created automatically.
                    </CardContent>
                  </Card>
                ) : (
                  pending.map((row) => (
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
                        const trimmed = r.trim();
                        if (!trimmed) {
                          toast.error("Add a reason before rejecting this order");
                          return;
                        }
                        setActiveId(row.approval_id);
                        mutation.mutate({ orderId, decision: "reject", reason: trimmed });
                      }}
                    />
                  ))
                )}
              </div>
            </section>

            {/* 8. RECENTLY REVIEWED */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recently Reviewed</h2>
                <span className="text-[9px] font-mono text-muted-foreground/40 italic">Decisions are immutable</span>
              </div>
              
              <div className="space-y-4">
                {reviewed.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest py-4">No decisions recorded yet.</p>
                ) : (
                  reviewed.slice(0, 5).map((row) => (
                    <ApprovalCard
                      key={row.approval_id}
                      row={row}
                      isPending={false}
                      isActive={false}
                      reason=""
                      onReasonChange={() => {}}
                      onApprove={() => {}}
                      onReject={() => {}}
                    />
                  ))
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-8">
            {/* 9, 10. PAYMENTS & VERIFIED PAYMENTS */}
            <PaymentLedgerCard />

            {/* 11. CHECKOUT AUDIT TRAIL */}
            <AuditTrail 
              events={audit.data ?? []} 
              isLoading={audit.isLoading} 
            />

            {/* 12. AUTHORITY MODEL */}
            <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden border-t-2 border-t-copper-500/40">
              <CardHeader className="bg-muted/30 border-b border-border pb-4">
                <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="size-3.5 text-copper-500" /> Authority Model
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4 text-[11px] text-muted-foreground leading-relaxed">
                <div className="space-y-2">
                  <p className="font-bold text-foreground uppercase tracking-tighter text-[9px]">Platform Principles</p>
                  <ul className="space-y-3">
                    <li className="flex gap-2">
                      <span className="text-copper-500">·</span>
                      <span>AI agent may request checkout; only you can approve or reject.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-copper-500">·</span>
                      <span>Order amounts are copied from the server quote, never from the model.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-copper-500">·</span>
                      <span>Illegal state transitions are rejected by a database trigger.</span>
                    </li>
                    <li className="flex gap-2 border-t border-border/40 pt-2 mt-2">
                      <span className="text-copper-500">·</span>
                      <span>Payments run in Razorpay test mode and only a server-verified signature can complete an order.</span>
                    </li>
                  </ul>
                </div>
                
                <div className="rounded-sm bg-muted/50 p-3 border border-border/40">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-foreground text-center">
                    AI requests · Server enforces · Human approves · Razorpay verifies
                  </p>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
