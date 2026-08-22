import { ClipboardCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ApprovalsHeaderProps {
  pendingCount: number;
  email?: string;
}

const threshold = 50000;

export function ApprovalsHeader({ pendingCount }: ApprovalsHeaderProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground uppercase">
              Checkout approvals
            </h1>
            <Badge variant="outline" className="rounded-none border-amber-500/50 text-amber-500 bg-amber-500/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
              {pendingCount} PENDING
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <ShieldAlert className="size-3.5 text-copper-500" />
            Human-in-the-loop review — the agent can request a checkout but never approve one
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-sm border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pending approval</p>
            <ClipboardCheck className="size-4 text-primary/60" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tighter text-foreground font-mono">{pendingCount}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-tighter">Orders waiting</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/40 pt-2">
            Orders whose value exceeds your automatic approval threshold.
          </p>
        </div>

        <div className="rounded-sm border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Auto-Approval Threshold</p>
            <span className="text-[9px] font-mono text-verified-green bg-verified-green/5 border border-verified-green/10 px-1.5 py-0.5 rounded-sm">LOCKED</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tighter text-foreground font-mono">₹50,000</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-tighter">Server Enforced</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/40 pt-2">
            Amounts are copied from the server quote and cannot be edited.
          </p>
        </div>

        <div className="rounded-sm border border-border bg-card p-4 flex flex-col justify-center items-center text-center space-y-2 bg-muted/10">
          <div className="size-8 rounded-full bg-primary/5 flex items-center justify-center border border-primary/10 mb-1">
            <div className="size-2 rounded-full bg-primary animate-pulse" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground">Authority Active</p>
          <p className="text-[9px] text-muted-foreground uppercase tracking-tighter">AI REQUEST → SERVER ENFORCES → HUMAN APPROVES</p>
        </div>
      </div>
    </div>
  );
}
