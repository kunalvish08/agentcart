import { ClipboardCheck, ShieldAlert, User } from "lucide-react";

interface ApprovalsHeaderProps {
  pendingCount: number;
  email?: string | null | undefined;
  totalPendingValue?: number;
}

const threshold = 50000;

export function ApprovalsHeader({ pendingCount, email, totalPendingValue = 0 }: ApprovalsHeaderProps) {
  const money = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <div className="space-y-8">
      {/* 1. HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between border-b border-border/40 pb-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground uppercase">
            Checkout approvals
          </h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <ShieldAlert className="size-3 text-copper-500" />
            Human-in-the-loop review — the agent can request a checkout but never approve one
          </p>
        </div>
        
        {email && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 border border-border/40 rounded-none self-start">
            <User className="size-3 text-muted-foreground/60" />
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-tighter">{email}</span>
          </div>
        )}
      </div>

      {/* 2. APPROVAL SUMMARY METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border/40 border border-border/40 overflow-hidden">
        <div className="bg-background p-4 space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Pending Approvals</p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tighter text-foreground font-mono">{pendingCount}</span>
            <span className={pendingCount > 0 ? "text-amber-500 text-[8px] animate-pulse" : "hidden"}>●</span>
          </div>
        </div>

        <div className="bg-background p-4 space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Approval Threshold</p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tighter text-foreground font-mono">₹{threshold.toLocaleString()}</span>
            <span className="text-[8px] text-verified-green font-mono opacity-40">ENFORCED</span>
          </div>
        </div>

        <div className="bg-background p-4 space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Pending Value</p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tighter text-foreground font-mono">{money(totalPendingValue)}</span>
          </div>
        </div>

        <div className="bg-background p-4 space-y-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Authority Status</p>
          <div className="flex items-center gap-2 pt-1">
            <div className="size-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[9px] font-bold text-foreground uppercase tracking-widest">ACTIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
