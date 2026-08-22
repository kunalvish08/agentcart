import { ArrowRight, Shield, User, Bot, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditEvent {
  id: string;
  event: string;
  actor_type: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  created_at: string;
}

interface AuditTrailProps {
  events: AuditEvent[];
  isLoading: boolean;
}

const ACTOR_ICONS: Record<string, any> = {
  system: Shield,
  merchant: User,
  ai_agent: Bot,
  buyer: ShoppingCart,
};

const ACTOR_COLORS: Record<string, string> = {
  system: "text-copper-500",
  merchant: "text-primary",
  ai_agent: "text-verified-green",
  buyer: "text-indigo-400",
};

export function AuditTrail({ events, isLoading }: AuditTrailProps) {
  return (
    <Card className="rounded-sm border-border bg-card shadow-none overflow-hidden">
      <CardHeader className="bg-muted/30 border-b border-border pb-4">
        <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Shield className="size-3.5" /> Checkout audit trail
        </CardTitle>
        <CardDescription className="text-[10px] uppercase tracking-tighter">
          Immutable server log of every state change and decision.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        {isLoading ? (
          <p className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest">
            <Loader2 className="size-3 animate-spin" /> Loading events…
          </p>
        ) : events.length === 0 ? (
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">No checkout events yet.</p>
        ) : (
          events.map((event) => {
            const Icon = ACTOR_ICONS[event.actor_type] || Shield;
            return (
              <div key={event.id} className="relative pl-6 border-l border-border/40 pb-4 last:pb-0">
                <div className="absolute -left-[5px] top-0 size-2.5 rounded-full border border-border bg-card" />
                
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-bold text-foreground uppercase tracking-tight break-words overflow-wrap-anywhere">
                    {event.event.replace(/_/g, ' ')}
                  </span>
                  <div className={cn("flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest", ACTOR_COLORS[event.actor_type])}>
                    <Icon className="size-2.5" />
                    {event.actor_type}
                  </div>
                </div>

                <div className="font-mono text-muted-foreground/60 flex items-center gap-2 mb-1.5">
                  <span className="text-[9px] uppercase break-all">{event.from_status || 'START'}</span>
                  <ArrowRight className="size-2.5 shrink-0" />
                  <span className="text-[9px] text-foreground uppercase break-all">{event.to_status ?? "—"}</span>
                </div>

                {event.reason && (
                  <p className="mb-2 text-[10px] text-muted-foreground italic border-l border-border/60 pl-2 leading-relaxed break-words overflow-wrap-anywhere">
                    {event.reason}
                  </p>
                )}
                
                <p className="text-[8px] font-mono text-muted-foreground/30 text-right">
                  {new Date(event.created_at).toLocaleString("en-IN")}
                </p>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
