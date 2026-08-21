// Phase 06 — merchant control-room payments panel (read-only).
//
// Deliberately provides no capture or refund controls: this phase exposes
// inspection and an idempotent, read-only reconciliation against Razorpay test mode.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, RefreshCw } from "lucide-react";
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
    { label: "Payments pending", value: metrics.data ? String(metrics.data.pending) : "—" },
    { label: "Payments verified", value: metrics.data ? String(metrics.data.verified) : "—" },
    { label: "Failed payments", value: metrics.data ? String(metrics.data.failed) : "—" },
    {
      label: "Completed orders",
      value: metrics.data ? String(metrics.data.completedOrders) : "—",
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4" /> Payments
            <Badge variant="outline" className="text-[10px] uppercase">
              Razorpay test mode
            </Badge>
          </CardTitle>
          <CardDescription>
            {metrics.data && !metrics.data.configured
              ? "Razorpay test credentials are not configured on the server yet — payments cannot be started."
              : "Verified value " +
                (metrics.data ? money(metrics.data.verifiedValue) : "—") +
                " · pending " +
                (metrics.data ? money(metrics.data.pendingValue) : "—")}
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => reconciliation.mutate()}
          disabled={reconciliation.isPending}
        >
          {reconciliation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Reconcile pending
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {counters.map((counter) => (
            <div key={counter.label}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {counter.label}
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">{counter.value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {ledger.isPending ? (
            <p className="text-sm text-muted-foreground">Loading payments…</p>
          ) : (ledger.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No payment attempts yet.</p>
          ) : (
            (ledger.data ?? []).map((row) => (
              <div key={row.payment_id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {row.product_name ?? "Order"} · {money(row.amount, row.currency)}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      order {row.order_id.slice(0, 8)} · {row.razorpay_order_id}
                      {row.razorpay_payment_id ? ` · ${row.razorpay_payment_id}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={row.payment_status === "VERIFIED" ? "default" : "secondary"}>
                      {PAYMENT_STATE_LABELS[row.payment_status]}
                    </Badge>
                    <Badge variant="outline">
                      {CHECKOUT_STATE_LABELS[row.order_status] ?? row.order_status}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.method ? `${row.method} · ` : ""}
                  {row.verified_at
                    ? `verified ${new Date(row.verified_at).toLocaleString("en-IN")}`
                    : row.captured_at
                      ? `captured ${new Date(row.captured_at).toLocaleString("en-IN")}`
                      : `created ${new Date(row.created_at).toLocaleString("en-IN")}`}
                  {row.failure_reason ? ` · ${row.failure_reason}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
