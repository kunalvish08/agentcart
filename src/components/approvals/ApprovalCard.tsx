import { AlertTriangle, Check, Loader2, X } from "lucide-react";
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
      "rounded-sm border border-border bg-card overflow-hidden transition-all",
      isPendingStatus ? "border-amber-500/20 shadow-[0_2px_10px_-4px_rgba(245,158,11,0.1)]" : "bg-muted/10 opacity-80"
    )}>
      <div className="grid gap-6 p-6 md:grid-cols-[1.5fr_1fr_auto]">
        {/* LEFT: Product + order information */}
        <div className="min-w-0 space-y-4">
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground truncate uppercase">
              {row.product_name ?? "Product"}{row.quantity ? ` × ${row.quantity}` : ""}
            </h3>
            <p className="text-[10px] font-mono text-muted-foreground/60 mt-1 uppercase tracking-tighter">
              PRODUCT ID: {row.order_id.slice(0, 8)} · REQUESTED: {new Date(row.requested_at).toLocaleString("en-IN")}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-none border",
              isPendingStatus 
                ? "text-amber-500 bg-amber-500/5 border-amber-500/20"
                : row.status === "approved"
                  ? "text-verified-green bg-verified-green/5 border-verified-green/20"
                  : "text-destructive bg-destructive/5 border-destructive/20"
            )}>
              {isPendingStatus ? "WAITING FOR MERCHANT APPROVAL" : row.status}
            </span>
          </div>

          {row.customer_request_summary && (
            <div className="pt-4 border-t border-border/40">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">Customer Intent Summary</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed italic border-l border-border/60 pl-3">
                {row.customer_request_summary}
              </p>
            </div>
          )}
        </div>

        {/* CENTER: Amount + approval reason */}
        <div className="space-y-4 md:border-l md:border-border/40 md:pl-6">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[10px] font-bold uppercase tracking-widest">
            <span className="text-muted-foreground/60">Subtotal</span>
            <span className="text-right text-foreground font-mono">{money(row.subtotal_amount, row.currency)}</span>
            <span className="text-muted-foreground/60">Discount</span>
            <span className="text-right text-verified-green font-mono">−{money(row.discount_amount, row.currency)}</span>
            <span className="text-foreground pt-2 border-t border-border/40 mt-1">Final Amount</span>
            <span className="text-right text-foreground font-mono text-base pt-2 border-t border-border/40 mt-1">{money(row.final_amount, row.currency)}</span>
          </div>

          {isPendingStatus && (
            <div className="rounded-sm bg-amber-500/5 border border-amber-500/10 p-3 space-y-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-500 flex items-center gap-1.5">
                <AlertTriangle className="size-3" /> APPROVAL REQUIRED
              </p>
              <p className="text-[10px] text-amber-500/80 leading-relaxed font-medium">
                {row.reason || "Order value exceeds merchant automatic approval threshold."}
              </p>
              {row.final_amount > threshold && (
                <div className="pt-2 border-t border-amber-500/10 flex items-center justify-between text-[9px] font-mono text-amber-500/60 uppercase">
                  <span>{money(row.final_amount)} {" > "} {money(threshold)}</span>
                  <span className="font-bold">DIFF: +{money(diff)}</span>
                </div>
              )}
              <p className="text-[8px] text-amber-500/30 uppercase tracking-widest text-center pt-1">Authoritative quote from server</p>
            </div>
          )}

          {!isPendingStatus && row.rejection_reason && (
            <div className="rounded-sm bg-destructive/5 border border-destructive/10 p-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-destructive mb-1">Rejection Reason</p>
              <p className="text-[10px] text-destructive/80 italic leading-relaxed">{row.rejection_reason}</p>
            </div>
          )}
        </div>

        {/* RIGHT: Approve / Reject */}
        <div className="flex flex-col gap-3 min-w-[180px] md:pl-6 md:border-l md:border-border/40">
          {isPendingStatus ? (
            <>
              <div className="space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Decision Note</p>
                <Textarea
                  value={reason}
                  onChange={(e) => onReasonChange(e.target.value)}
                  placeholder="Required for rejection..."
                  className="text-[10px] min-h-[70px] resize-none bg-muted/20 border-border/60 focus:border-primary/40 rounded-none placeholder:text-muted-foreground/30 uppercase tracking-tighter"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-auto">
                <Button
                  size="sm"
                  disabled={isPending}
                  className="bg-verified-green hover:bg-verified-green/90 text-white rounded-none h-9 text-[10px] uppercase font-bold tracking-widest transition-all active:scale-[0.96] shadow-sm shadow-verified-green/20"
                  onClick={() => onApprove(row.order_id)}
                >
                  {isPending && isActive ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3 mr-1" />}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  className="border-destructive/20 text-destructive hover:bg-destructive hover:text-white rounded-none h-9 text-[10px] uppercase font-bold tracking-widest transition-all active:scale-[0.96]"
                  onClick={() => onReject(row.order_id, reason)}
                >
                  <X className="size-3 mr-1" />
                  Reject
                </Button>
              </div>
            </>
          ) : (
            <div className="text-right flex flex-col justify-end h-full">
               <p className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest leading-relaxed">
                Decision Immutable<br />
                {row.reviewed_at ? new Date(row.reviewed_at).toLocaleString("en-IN") : "—"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
