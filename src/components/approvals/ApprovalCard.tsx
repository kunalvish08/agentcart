import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type ApprovalQueueRow } from "@/lib/checkout.functions";
import { cn } from "@/lib/utils";

interface ApprovalCardProps {
  row: ApprovalQueueRow;
  isPending: boolean;
  isActive: boolean;
  reason: string;
  onReasonChange: (val: string) => void;
  onApprove: (orderId: string) => void;
  onReject: (orderId: string, reason: string) => void;
}

const money = (amount: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);

export function ApprovalCard({
  row,
  isPending,
  isActive,
  reason,
  onReasonChange,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const isPendingStatus = row.status === "pending";
  const threshold = 50000; // Reference threshold
  const diff = row.final_amount - threshold;

  return (
    <div className={cn(
      "rounded-sm border border-border bg-card overflow-hidden",
      isPendingStatus ? "border-amber-500/20" : "bg-muted/20"
    )}>
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1.2fr_auto]">
        {/* LEFT: Product + order information */}
        <div className="min-w-0 space-y-2">
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground truncate">
              {row.product_name ?? "Product"}{row.quantity ? ` × ${row.quantity}` : ""}
            </h3>
            <p className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
              ORDER {row.order_id.slice(0, 8)} · {new Date(row.requested_at).toLocaleString("en-IN")}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border",
              isPendingStatus 
                ? "text-amber-500 bg-amber-500/5 border-amber-500/10"
                : row.status === "approved"
                  ? "text-verified-green bg-verified-green/5 border-verified-green/10"
                  : "text-destructive bg-destructive/5 border-destructive/10"
            )}>
              {isPendingStatus ? "Waiting for merchant approval" : row.status}
            </span>
          </div>

          {row.customer_request_summary && (
            <div className="mt-4 pt-4 border-t border-border/40">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Customer Intent</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                {row.customer_request_summary}
              </p>
            </div>
          )}
        </div>

        {/* CENTER: Amount + approval reason */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[10px] font-bold uppercase tracking-widest">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-right text-foreground font-mono">{money(row.subtotal_amount, row.currency)}</span>
            <span className="text-muted-foreground">Discount</span>
            <span className="text-right text-verified-green font-mono">−{money(row.discount_amount, row.currency)}</span>
            <span className="text-foreground pt-1 border-t border-border/20">Final Order Value</span>
            <span className="text-right text-foreground font-mono text-sm pt-1 border-t border-border/20">{money(row.final_amount, row.currency)}</span>
          </div>

          {isPendingStatus && (
            <div className="rounded-sm bg-amber-500/5 border border-amber-500/10 p-3 space-y-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-500 flex items-center gap-1.5">
                <AlertTriangle className="size-3" /> Approval Required
              </p>
              <p className="text-[10px] text-amber-500/80 leading-snug">
                {row.reason || "Order value exceeds merchant automatic approval threshold."}
              </p>
              {row.final_amount > threshold && (
                <p className="text-[9px] font-mono text-amber-500/60 pt-1 border-t border-amber-500/10">
                  {money(row.final_amount)} {" > "} {money(threshold)} (Diff: +{money(diff)})
                </p>
              )}
              <p className="text-[8px] text-amber-500/40 uppercase tracking-tighter">Amount comes from server quote</p>
            </div>
          )}

          {!isPendingStatus && row.rejection_reason && (
            <div className="rounded-sm bg-destructive/5 border border-destructive/10 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-destructive mb-1">Rejection Reason</p>
              <p className="text-[10px] text-destructive/80 italic">{row.rejection_reason}</p>
            </div>
          )}
        </div>

        {/* RIGHT: Approve / Reject */}
        <div className="flex flex-col gap-2 min-w-[160px]">
          {isPendingStatus ? (
            <>
              <Textarea
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                placeholder="Reason (required for reject)..."
                className="text-[10px] min-h-[60px] resize-none bg-muted/30 border-border/40 focus:border-primary/40 rounded-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  disabled={isPending}
                  className="bg-verified-green hover:bg-verified-green/90 text-white rounded-none h-8 text-[10px] uppercase font-bold tracking-widest transition-all active:scale-[0.98]"
                  onClick={() => onApprove(row.order_id)}
                >
                  {isPending && isActive ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3 mr-1" />}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  className="border-destructive/20 text-destructive hover:bg-destructive hover:text-white rounded-none h-8 text-[10px] uppercase font-bold tracking-widest transition-all active:scale-[0.98]"
                  onClick={() => onReject(row.order_id, reason)}
                >
                  <X className="size-3 mr-1" />
                  Reject
                </Button>
              </div>
            </>
          ) : (
            <div className="text-right">
               <p className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest">
                Decision immutable<br />
                {row.reviewed_at ? new Date(row.reviewed_at).toLocaleString("en-IN") : "—"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
