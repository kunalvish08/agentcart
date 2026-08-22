// Phase 06 — merchant control-room payments panel (read-only).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHECKOUT_STATE_LABELS } from "@/lib/checkout-state";
import { PAYMENT_STATE_LABELS } from "@/lib/payment-state";
import {
  getPaymentLedger,
  getPaymentMetrics,
  runPaymentReconciliation,
} from "@/lib/payments.functions";
import { cn } from "@/lib/utils";

const money = (amount: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    amount,
  );

export function PaymentLedgerCard() {
  const queryClient = useQueryClient();
  const fetchLedger = useServerFn(getPaymentLedger);
  const fetchMetrics = useServerFn(getPaymentMetrics);
  const reconcile = useServerFn(runPaymentReconciliation);

  const metrics = useQuery({
    queryKey: ["payment-metrics"],
    queryFn: () => fetchMetrics(),
    refetchInterval: 15_000,
  });
  const ledger = useQuery({
    queryKey: ["payment-ledger"],
    queryFn: () => fetchLedger(),
    refetchInterval: 15_000,
  });

  const reconciliation = useMutation({
    mutationFn: () => reconcile({ data: {} }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        `Reconciliation checked ${result.checked} pending payment(s); ${result.updated} updated.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payment-ledger"] }),
        queryClient.invalidateQueries({ queryKey: ["payment-metrics"] }),
        queryClient.invalidateQueries({ queryKey: ["checkout-audit"] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Reconciliation failed."),
  });

  const counters = [
    { label: "Payments pending", value: metrics.data?.pending, status: "amber" },
    { label: "Payments verified", value: metrics.data?.verified, status: "emerald" },
    { label: "Failed payments", value: metrics.data?.failed, status: "coral" },
    { label: "Completed orders", value: metrics.data?.completedOrders, status: "neutral" },
  ];

  return (
    <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden border-t-2 border-t-primary/40">
      <CardHeader className="bg-muted/30 border-b border-border pb-4">
        <div className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <CreditCard className="size-3.5" /> Payment Health
            </CardTitle>
            <CardDescription className="text-[10px] uppercase tracking-tighter mt-1">
              Razorpay Test Mode · Verified: {metrics.data ? money(metrics.data.verifiedValue) : "—"}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => reconciliation.mutate()}
            disabled={reconciliation.isPending}
            className="h-7 text-[9px] uppercase font-bold tracking-widest rounded-none"
          >
            {reconciliation.isPending ? (
              <Loader2 className="size-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="size-3 mr-1" />
            )}
            Reconcile
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          {counters.map((counter) => (
            <div key={counter.label} className="space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                {counter.label}
              </p>
              <div className="flex items-baseline gap-2">
                <p className={cn(
                  "text-xl font-bold font-mono tracking-tighter",
                  counter.status === "amber" && "text-amber-500",
                  counter.status === "emerald" && "text-verified-green",
                  counter.status === "coral" && "text-destructive",
                  counter.status === "neutral" && "text-foreground"
                )}>
                  {counter.value ?? "—"}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 pt-4 border-t border-border/40">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Verified Payments</p>
          {ledger.isPending ? (
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Loading payments…</p>
          ) : (ledger.data ?? []).length === 0 ? (
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">No payment attempts yet.</p>
          ) : (
            (ledger.data ?? []).map((row) => (
              <div key={row.payment_id} className="rounded-sm border border-border bg-muted/20 p-3 text-[10px]">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground uppercase truncate">
                      {row.product_name ?? "Order"}
                    </p>
                    <p className="text-[9px] font-mono text-muted-foreground/60 break-all">
                      ID: {row.order_id.slice(0, 8)} · {row.razorpay_order_id}
                    </p>
                  </div>
                  <p className="font-mono font-bold text-foreground whitespace-nowrap">
                    {money(row.amount, row.currency)}
                  </p>
                </div>
                
                <div className="space-y-1 font-mono text-[9px] text-muted-foreground/60 border-t border-border/40 pt-2 mb-2 break-all">
                  <p>PAYMENT: {row.razorpay_payment_id || "PENDING"}</p>
                  <p>METHOD: {row.method?.toUpperCase() || "—"}</p>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "size-1.5 rounded-full",
                      row.payment_status === "VERIFIED" ? "bg-verified-green" : "bg-amber-500"
                    )} />
                    <span className={cn(
                      "font-bold uppercase tracking-widest text-[9px]",
                      row.payment_status === "VERIFIED" ? "text-verified-green" : "text-amber-500"
                    )}>
                      {PAYMENT_STATE_LABELS[row.payment_status]}
                    </span>
                  </div>
                  <p className="text-[8px] opacity-40">
                    {row.verified_at ? new Date(row.verified_at).toLocaleString("en-IN") : "—"}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
