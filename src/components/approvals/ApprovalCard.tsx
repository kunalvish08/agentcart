import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type ApprovalQueueRow } from "@/lib/checkout.functions";
import { cn } from "@/lib/utils";
import { useState } from "react";

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
  const [isExpanded, setIsExpanded] = useState(false);
  const isPendingStatus = row.status === "pending";
  const threshold = 50000; // Reference threshold
  const requestedAt = new Date(row.requested_at).toLocaleString("en-IN", {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return (
    <div className={cn(
      "rounded-sm border border-border bg-card overflow-hidden transition-all",
      isPendingStatus ? "border-amber-500/20 shadow-[0_2px_10px_-4px_rgba(245,158,11,0.1)]" : "bg-muted/10 opacity-80"
    )}>
      {/* COMPACT ROW */}
      <div className="grid gap-4 p-4 md:grid-cols-[1.5fr_1fr_1.5fr_auto] items-center">
        {/* LEFT: Product + order information */}
        <div className="min-w-0 space-y-1">
          <h3 className="text-[11px] font-bold tracking-tight text-foreground truncate uppercase">
            {row.product_name ?? "Product"}{row.quantity ? ` × ${row.quantity}` : ""}
          </h3>
          <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-tighter">
            Order {row.order_id.slice(0, 8)} · {requestedAt}
          </p>
        </div>

        {/* CENTER: Status Badge (Always visible in center-left for scannability) */}
        <div className="flex items-center">
          <span className={cn(
            "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-none border",
            isPendingStatus 
              ? "text-amber-500 bg-amber-500/5 border-amber-500/20"
              : row.status === "approved"
                ? "text-verified-green bg-verified-green/5 border-verified-green/20"
                : "text-destructive bg-destructive/5 border-destructive/20"
          )}>
            {isPendingStatus ? "WAITING FOR APPROVAL" : row.status}
          </span>
        </div>

        {/* RIGHT-CENTER: Amount */}
        <div className="text-right pr-4">
          <p className="text-[13px] font-mono font-bold text-foreground">
            {money(row.final_amount, row.currency)}
          </p>
        </div>

        {/* RIGHT: Actions & Expand Toggle */}
        <div className="flex items-center gap-2">
          {isPendingStatus && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                className="border-destructive/20 text-destructive hover:bg-destructive hover:text-white rounded-none h-7 px-2.5 text-[9px] uppercase font-bold tracking-widest transition-all active:scale-[0.96]"
                onClick={() => onReject(row.order_id, reason)}
              >
                Reject
              </Button>
              <Button
                size="sm"
                disabled={isPending}
                className="bg-verified-green hover:bg-verified-green/90 text-white rounded-none h-7 px-2.5 text-[9px] uppercase font-bold tracking-widest transition-all active:scale-[0.96] shadow-sm shadow-verified-green/20"
                onClick={() => onApprove(row.order_id)}
              >
                {isPending && isActive ? <Loader2 className="size-3 animate-spin" /> : "Approve"}
              </Button>
            </div>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0 rounded-none text-muted-foreground/40 hover:text-foreground"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </Button>
        </div>
      </div>

      {/* EXPANDED DETAILS */}
      {isExpanded && (
        <div className="border-t border-border/40 bg-muted/5 p-6 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-6">
              {row.customer_request_summary && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Customer Intent</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed italic border-l-2 border-border pl-4">
                    "{row.customer_request_summary}"
                  </p>
                </div>
              )}

              {isPendingStatus && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-amber-500/60 mb-2">Server Decision</p>
                  <div className="rounded-sm bg-amber-500/5 border border-amber-500/10 p-3 space-y-2">
                    <p className="text-[10px] text-amber-500/90 leading-relaxed font-medium">
                      {row.reason || `₹${row.final_amount.toLocaleString()} exceeds ₹${threshold.toLocaleString()} automatic approval threshold.`}
                    </p>
                  </div>
                </div>
              )}

              {row.rejection_reason && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-destructive/60 mb-2">Rejection Reason</p>
                  <p className="text-[10px] text-destructive/80 italic leading-relaxed border-l-2 border-destructive/40 pl-4">
                    {row.rejection_reason}
                  </p>
                </div>
              )}

              {isPendingStatus && (
                <div className="space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Decision Note (Optional)</p>
                  <Textarea
                    value={reason}
                    onChange={(e) => onReasonChange(e.target.value)}
                    placeholder="Enter reason for rejection or approval notes..."
                    className="text-[10px] min-h-[80px] resize-none bg-background border-border/60 focus:border-primary/40 rounded-none placeholder:text-muted-foreground/30 uppercase tracking-tighter"
                  />
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Financial Breakdown</p>
                <div className="rounded-sm border border-border/40 p-4 space-y-2.5">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-foreground">{money(row.subtotal_amount, row.currency)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="text-verified-green">−{money(row.discount_amount, row.currency)}</span>
                  </div>
                  <div className="pt-2.5 border-t border-border/40 flex justify-between items-baseline">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-foreground">Final Order Value</span>
                    <span className="text-base font-mono font-bold text-foreground">{money(row.final_amount, row.currency)}</span>
                  </div>
                </div>
                <p className="text-[8px] text-muted-foreground/30 uppercase tracking-widest mt-2 text-right">Server-Authoritative Quote</p>
              </div>

              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Metadata</p>
                <div className="grid grid-cols-2 gap-4 text-[9px] font-mono">
                  <div className="space-y-1">
                    <p className="text-muted-foreground/40 uppercase">APPROVAL ID</p>
                    <p className="text-muted-foreground">{row.approval_id}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground/40 uppercase">QUOTED AT</p>
                    <p className="text-muted-foreground">{requestedAt}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
