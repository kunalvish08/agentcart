import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  Handshake,
  IndianRupee,
  Package,
  Percent,
  Store,
  ArrowRight,
  ArrowDown,
  ShieldCheck,
  ClipboardCheck,
  CreditCard,
  Layers,
  Search,
  Activity,
  History,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCheckoutMetrics, getCheckoutAudit } from "@/lib/checkout.functions";
import { getGrowthMetrics, getWorkspace } from "@/lib/merchant.functions";
import { getPaymentMetrics } from "@/lib/payments.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function DashboardPage() {
  const fetchWorkspace = useServerFn(getWorkspace);
  const fetchGrowth = useServerFn(getGrowthMetrics);
  const fetchCheckout = useServerFn(getCheckoutMetrics);
  const fetchPayments = useServerFn(getPaymentMetrics);
  const fetchAudit = useServerFn(getCheckoutAudit);

  const { data: data, isPending: isWorkspacePending } = useQuery({
    queryKey: ["workspace"],
    queryFn: () => fetchWorkspace(),
  });
  const { data: growth } = useQuery({
    queryKey: ["growth-metrics"],
    queryFn: () => fetchGrowth(),
  });
  const { data: checkout } = useQuery({
    queryKey: ["checkout-metrics"],
    queryFn: () => fetchCheckout(),
    refetchInterval: 15_000,
  });
  const { data: payments } = useQuery({
    queryKey: ["payment-metrics"],
    queryFn: () => fetchPayments(),
    refetchInterval: 15_000,
  });
  const { data: audit } = useQuery({
    queryKey: ["checkout-audit"],
    queryFn: () => fetchAudit(),
    refetchInterval: 15_000,
  });

  const manifestUrl =
    typeof window === "undefined"
      ? "/.well-known/agent-manifest"
      : `${window.location.origin}/.well-known/agent-manifest`;

  return (
    <AppShell
      title={data?.merchant.name ?? "TechNova Store"}
      subtitle="'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            from dashboard page , pls delete this content -   \"'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\\n \\n \\n delete it from the websote - '''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\\\\n \\\\n \\\\n '''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\\\\\\\\n \\\\\\\\n \\\\\\\\n abhi currunt texts and color theeme kya hai website ka ??? ye kyu aa raha hai\""
      accountLabel={data?.profile.email ?? undefined}
    >
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* 1. HEADER / STORE STATUS */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-6">
          <div className="flex flex-col gap-1">
             <h2 className="text-3xl font-semibold tracking-tight text-slate-900">TechNova Store</h2>
             <div className="flex items-center gap-3">
               <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600">
                 <div className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                 STORE ACTIVE
               </div>
               <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
                 <ShieldCheck className="size-3" />
                 AI COMMERCE ENABLED
               </div>
             </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-7 px-2.5 text-[10px] font-bold tracking-widest uppercase">Currency: INR</Badge>
            {(data?.roles ?? []).map((role) => (
              <Badge key={role} variant="secondary" className="h-7 px-2.5 text-[10px] font-bold tracking-widest uppercase">Role: {role}</Badge>
            ))}
          </div>
        </div>

        {/* 2. MAIN HERO & FLOW */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-2xl border border-border bg-card p-8 shadow-sm overflow-hidden"
        >
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none" 
               style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, black 1px, transparent 0)', backgroundSize: '32px 32px' }} />
          
          <div className="relative flex flex-col items-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-8">Authoritative Commerce Chain</p>
            
            <div className="flex flex-wrap justify-center items-center gap-4 md:gap-8">
              <FlowStep label="CATALOG" icon={Search} />
              <FlowConnector />
              <FlowStep label="AI BUYER" icon={Bot} />
              <FlowConnector />
              <FlowStep 
                label="SERVER AUTHORITY" 
                icon={ShieldCheck} 
                active 
                className="scale-125 mx-2 md:mx-4 ring-8 ring-primary/5 border-primary bg-primary text-primary-foreground"
              />
              <FlowConnector />
              <FlowStep label="APPROVAL" icon={ClipboardCheck} />
              <FlowConnector />
              <FlowStep label="RAZORPAY" icon={CreditCard} />
              <FlowConnector />
              <FlowStep label="COMPLETED" icon={CheckCircle2} />
            </div>
          </div>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            {/* 3. STORE OVERVIEW */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Products" value={data?.stats.totalProducts} icon={Package} />
              <Stat label="Inventory Units" value={data?.stats.totalInventoryUnits.toLocaleString("en-IN")} icon={Layers} />
              <Stat label="Active Products" value={data?.stats.activeProducts} icon={CheckCircle2} />
              <Stat label="Inventory Value" value={data ? inr.format(data.stats.inventoryValue) : "—"} icon={Store} />
            </div>

            {/* 4. COMMERCIAL RULES */}
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                   <ShieldCheck className="size-3.5" /> Commercial Rules
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-8 sm:grid-cols-3">
                  <RuleItem label="Max Discount" value={`${data?.policy.max_discount_percent}%`} />
                  <RuleItem label="Max Order Value" value={data ? inr.format(data.policy.max_order_value) : "—"} />
                  <RuleItem label="Approval Threshold" value={data ? inr.format(data.policy.approval_required_above) : "—"} />
                </div>
                <div className="mt-8 pt-6 border-t border-border/40 flex flex-wrap items-center gap-x-8 gap-y-4">
                  <StatusToggle label="Negotiation" enabled={data?.policy.allow_negotiation ?? false} />
                  <StatusToggle label="Upsell" enabled={data?.policy.allow_upsell ?? false} />
                  <p className="text-[11px] font-bold text-primary uppercase tracking-widest italic ml-auto">
                    AI may request. Policy decides.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* 2. NEGOTIATION & GROWTH */}
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-4 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                   <TrendingUp className="size-3.5" /> Negotiation & Growth
                </CardTitle>
                <div className="text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/10">
                  POLICY CAP: 12%
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col md:flex-row items-stretch gap-4">
                   <RevenueMetric label="List Value" value={growth ? inr.format(growth.listValue) : "—"} />
                   <div className="flex items-center justify-center px-2 text-muted-foreground/30">
                     <ArrowRight className="hidden md:block" />
                     <ArrowDown className="md:hidden" />
                   </div>
                   <RevenueMetric label="Final Offer" value={growth ? inr.format(growth.offerValue) : "—"} active />
                   <div className="flex items-center justify-center px-2 text-muted-foreground/30">
                     <ArrowRight className="hidden md:block" />
                     <ArrowDown className="md:hidden" />
                   </div>
                   <RevenueMetric label="Discount Given" value={growth ? inr.format(growth.discountGiven) : "—"} sub={`Avg ${growth?.avgApprovedDiscount}%`} />
                </div>
                
                <div className="grid gap-6 grid-cols-2 md:grid-cols-4 pt-2">
                  <SmallMetric label="Negotiations" value={growth?.negotiations} sub={`${growth?.openNegotiations} open`} />
                  <SmallMetric label="Counter-offers" value={growth?.countered} sub="Policy enforced" />
                  <SmallMetric label="Offers Made" value={growth?.offers} />
                  <SmallMetric label="Upsell" value={growth?.acceptedRecommendations} sub={`${growth?.recommendations} units`} />
                </div>

                <p className="text-[10px] text-muted-foreground italic font-medium pt-2 border-t border-border/40">
                  "Discount decisions are enforced by the server policy engine."
                </p>
              </CardContent>
            </Card>

            {/* 6. AGENTIC CHECKOUT */}
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-4 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                   <ClipboardCheck className="size-3.5" /> Agentic Checkout Pipeline
                </CardTitle>
                <Button asChild size="sm" variant="ghost" className="h-7 text-[10px] font-bold uppercase tracking-widest hover:bg-primary/5 hover:text-primary">
                  <Link to="/approvals">Approval Queue <ArrowRight className="ml-2 size-3" /></Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-5 gap-2">
                  <PipelineStep label="Requests" value={checkout?.orders} active={Boolean(checkout?.orders)} />
                  <PipelineStep label="Approvals" value={checkout?.pendingApprovals} active={Boolean(checkout?.pendingApprovals)} highlight />
                  <PipelineStep label="Payment" value={checkout?.awaitingPayment} active={Boolean(checkout?.awaitingPayment)} />
                  <PipelineStep label="Verified" value={payments?.verified} active={Boolean(payments?.verified)} />
                  <PipelineStep label="Completed" value={payments?.completedOrders} active={Boolean(payments?.completedOrders)} />
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                    <p className="text-muted-foreground uppercase font-bold text-[9px] tracking-widest mb-1">Human Decision Needed</p>
                    <p className="text-sm font-semibold">{checkout?.pendingApprovals ?? 0} orders awaiting review</p>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                    <p className="text-muted-foreground uppercase font-bold text-[9px] tracking-widest mb-1">Payment Pending</p>
                    <p className="text-sm font-semibold">{inr.format(checkout?.paymentPendingValue ?? 0)} in transit</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            {/* 7. AI SYSTEM STATUS */}
            <Card className="border-border/60 shadow-none bg-slate-50/50">
              <CardHeader className="pb-4">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                   <Activity className="size-3.5" /> AI Commerce Infrastructure
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <StatusRow label="Catalog" status="live" />
                  <StatusRow label="Public API" status="operational" />
                  <StatusRow label="Negotiation" status="enforced" />
                  <StatusRow label="Upsell" status="enforced" />
                  <StatusRow label="Razorpay" status={payments?.configured ? "test mode" : "offline"} />
                </div>
                
                <div className="pt-4 border-t border-border/40 space-y-3 opacity-80">
                  <div className="flex flex-col gap-1">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Discovery Manifest</p>
                    <code className="text-[10px] bg-white border border-border/60 rounded px-2 py-1 truncate text-slate-500">{manifestUrl}</code>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tight">
                    <span className="text-muted-foreground">API Requests (24h)</span>
                    <span className="text-slate-700">{data?.agentApi.requests24h ?? 0}</span>
                  </div>
                  <Button asChild variant="outline" className="w-full h-8 text-[10px] font-bold uppercase tracking-widest shadow-none">
                    <Link to="/agent-api">View Agent API Documentation</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 8. JUDGE MODE PROOF */}
            <Card className="border-primary/20 shadow-none bg-primary/[0.02]">
              <CardHeader className="pb-4">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                   <ShieldCheck className="size-3.5" /> Proof of Authority
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-[11px] font-medium leading-relaxed text-slate-600">
                  "Run one complete transaction and inspect every decision made by the server."
                </p>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-900">
                  <div className="flex items-center gap-1.5"><div className="size-1 rounded-full bg-primary" /> 11 STEPS</div>
                  <div className="flex items-center gap-1.5"><div className="size-1 rounded-full bg-primary" /> 5 TOOL CALLS</div>
                  <div className="flex items-center gap-1.5"><div className="size-1 rounded-full bg-primary" /> SERVER PRICING</div>
                  <div className="flex items-center gap-1.5"><div className="size-1 rounded-full bg-primary" /> VERIFIED PAY</div>
                </div>
                <Button asChild className="w-full h-9 text-[11px] font-bold uppercase tracking-widest shadow-none">
                  <Link to="/judge">Open Judge Mode</Link>
                </Button>
              </CardContent>
            </Card>

            {/* 9. RECENT ACTIVITY */}
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-4">
                <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                   <History className="size-3.5" /> Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 relative">
                  <div className="absolute left-[7px] top-2 bottom-2 w-[1px] bg-border/40" />
                  {audit && audit.length > 0 ? (
                    audit
                      .filter((event, index, self) => 
                        index === self.findIndex((e) => e.event === event.event && e.created_at === event.created_at)
                      )
                      .slice(0, 5)
                      .map((event) => (
                        <div key={event.id} className="relative pl-6 space-y-1">
                          <div className="absolute left-0 top-[5px] size-[15px] rounded-full bg-white border border-border flex items-center justify-center">
                            <div className={cn("size-1.5 rounded-full", event.event.includes('REJECTED') ? 'bg-destructive' : 'bg-primary/60')} />
                          </div>
                          <p className="text-[11px] font-bold uppercase tracking-tight text-foreground">{event.event.replace(/_/g, ' ')}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(event.created_at).toLocaleString("en-IN", { timeStyle: 'short', dateStyle: 'short' })}</p>
                        </div>
                      ))
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic pl-2">No transaction history yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function FlowStep({ label, icon: Icon, active = false, className }: { label: string; icon: any; active?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 transition-all", active ? "scale-110" : "opacity-60")}>
      <div className={cn(
        "flex size-12 items-center justify-center rounded-xl border transition-all",
        active ? "bg-primary text-primary-foreground border-primary shadow-lg ring-4 ring-primary/10" : "bg-muted/30 text-muted-foreground border-border",
        className
      )}>
        <Icon className="size-5" />
      </div>
      <span className={cn("text-[10px] font-bold uppercase tracking-widest text-center max-w-[80px]", active ? "text-primary" : "text-muted-foreground")}>{label}</span>
    </div>
  );
}

function FlowConnector() {
  return (
    <div className="hidden md:flex items-center text-muted-foreground/30 mb-8">
      <ArrowRight className="size-4" />
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: any; icon: any }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-none">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-semibold tracking-tight text-slate-900">{value ?? "—"}</p>
    </div>
  );
}

function RuleItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-semibold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function StatusToggle({ label, enabled }: { label: string; enabled?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn("size-2 rounded-full", enabled ? "bg-emerald-500 shadow-[0_0_8px_oklch(0.64_0.17_153)]" : "bg-slate-300")} />
      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-600">{label}</span>
    </div>
  );
}

function RevenueMetric({ label, value, active = false, sub }: { label: string; value: string; active?: boolean; sub?: string }) {
  return (
    <div className={cn(
      "flex-1 flex flex-col justify-center rounded-xl border p-4 shadow-none",
      active ? "bg-primary/[0.03] border-primary/20" : "bg-card border-border/60"
    )}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{label}</p>
      <p className={cn("text-xl font-bold tracking-tight", active ? "text-primary" : "text-slate-900")}>{value}</p>
      {sub && <p className="mt-1 text-[10px] font-bold uppercase text-primary/70">{sub}</p>}
    </div>
  );
}

function SmallMetric({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-bold text-slate-900">{value ?? 0}</p>
      {sub && <p className="text-[9px] font-bold uppercase text-muted-foreground/60 tracking-tight">{sub}</p>}
    </div>
  );
}

function PipelineStep({ label, value, active = false, highlight = false }: { label: string; value: any; active?: boolean; highlight?: boolean }) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center gap-1 rounded-lg border py-2 transition-all",
      highlight && active ? "bg-primary text-primary-foreground border-primary shadow-sm" : 
      active ? "bg-primary/5 border-primary/20 text-primary" : "bg-muted/10 border-border/40 text-muted-foreground"
    )}>
      <span className="text-xs font-bold">{value ?? 0}</span>
      <span className="text-[8px] font-bold uppercase tracking-widest text-center px-1">{label}</span>
    </div>
  );
}

function StatusRow({ label, status }: { label: string; status: string }) {
  const isOk = ['live', 'operational', 'configured', 'enforced'].includes(status);
  return (
    <div className="flex items-center justify-between text-[11px] font-semibold">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={cn("capitalize", isOk ? "text-emerald-600" : "text-amber-600")}>{status}</span>
        <div className={cn("size-1.5 rounded-full", isOk ? "bg-emerald-500" : "bg-amber-500")} />
      </div>
    </div>
  );
}
