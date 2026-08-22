import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  CheckCircle2,
  CreditCard,
  Layers,
  Package,
  ShieldCheck,
  Store,
  ArrowRight,
  ClipboardCheck,
  Activity,
  History,
  TrendingUp,
  Search,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCheckoutMetrics, getCheckoutAudit } from "@/lib/checkout.functions";
import { getGrowthMetrics, getWorkspace } from "@/lib/merchant.functions";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/dashboard/CountUp";

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
  const fetchAudit = useServerFn(getCheckoutAudit);

  const { data: data } = useQuery({ queryKey: ["workspace"], queryFn: () => fetchWorkspace() });
  const { data: growth } = useQuery({ queryKey: ["growth-metrics"], queryFn: () => fetchGrowth() });
  const { data: checkout } = useQuery({ queryKey: ["checkout-metrics"], queryFn: () => fetchCheckout(), refetchInterval: 15_000 });
  const { data: audit } = useQuery({ queryKey: ["checkout-audit"], queryFn: () => fetchAudit(), refetchInterval: 15_000 });

  const manifestUrl = typeof window === "undefined" ? "/.well-known/agent-manifest" : `${window.location.origin}/.well-known/agent-manifest`;

  return (
    <AppShell
      title={data?.merchant.name ?? "TechNova Store"}
      subtitle="Commerce Control Plane — Catalog, policy, agent activity and transaction authority."
      accountLabel={data?.profile.email ?? undefined}
    >
      <div className="space-y-8 max-w-7xl mx-auto pb-20">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{data?.merchant.name ?? "TechNova Store"}</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mt-1">Commerce Control Plane</p>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1.5 rounded-full bg-verified-green/10 px-3 py-1 text-[10px] font-bold text-verified-green">
               <div className="h-1.5 w-1.5 rounded-full bg-verified-green animate-pulse" />
               STORE LIVE
             </div>
             <Badge variant="outline" className="rounded-full h-7 text-[10px] uppercase font-bold tracking-widest">INR</Badge>
          </div>
        </header>

        {/* SECTION 1: HEALTH */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Products" value={data?.stats.totalProducts} icon={Package} />
          <Stat label="Inventory" value={data?.stats.totalInventoryUnits.toLocaleString("en-IN")} icon={Layers} />
          <Stat label="Active" value={data?.stats.activeProducts} icon={CheckCircle2} />
          <Stat label="Inventory Value" value={data ? inr.format(data.stats.inventoryValue) : "—"} icon={Store} />
        </section>

        {/* SECTION 2: AUTHORITY PIPELINE */}
        <section className="border border-border bg-card p-6 rounded-sm">
           <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-8">Authority Pipeline</h3>
           <div className="flex flex-wrap justify-between items-center gap-4">
             <PipelineNode label="CATALOG" icon={Search} />
             <div className="text-muted-foreground/30"><ArrowRight /></div>
             <PipelineNode label="AI BUYER" icon={Bot} />
             <div className="text-muted-foreground/30"><ArrowRight /></div>
             <PipelineNode label="SERVER AUTHORITY" icon={ShieldCheck} active />
             <div className="text-muted-foreground/30"><ArrowRight /></div>
             <PipelineNode label="APPROVAL" icon={ClipboardCheck} />
             <div className="text-muted-foreground/30"><ArrowRight /></div>
             <PipelineNode label="RAZORPAY" icon={CreditCard} />
             <div className="text-muted-foreground/30"><ArrowRight /></div>
             <PipelineNode label="COMPLETED" icon={CheckCircle2} />
           </div>
        </section>

        <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                {/* SECTION 3: RULES */}
                <section className="border border-border p-6 rounded-sm">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground flex items-center gap-2 mb-6">
                       <ShieldCheck className="size-4 text-copper" /> Commercial Rules
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
                        <Rule label="Max Discount" value={`${data?.policy.max_discount_percent}%`} />
                        <Rule label="Max Order" value={data ? inr.format(data.policy.max_order_value) : "—"} />
                        <Rule label="Approval Threshold" value={data ? inr.format(data.policy.approval_required_above) : "—"} />
                        <Rule label="Negotiation" value={data?.policy.allow_negotiation ? "Enabled" : "Disabled"} />
                        <Rule label="Upsell" value={data?.policy.allow_upsell ? "Enabled" : "Disabled"} />
                    </div>
                    <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
                         <p className="text-xs font-bold text-copper uppercase tracking-widest italic">AI may request. Policy decides.</p>
                    </div>
                </section>

                {/* SECTION 4: NEGOTIATION */}
                <section className="border border-border p-6 rounded-sm">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground mb-6 flex items-center gap-2">
                        <TrendingUp className="size-4 text-copper" /> Negotiation & Growth
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <SmallStat label="List Value" value={growth ? inr.format(growth.listValue) : "—"} />
                        <SmallStat label="Final Offer" value={growth ? inr.format(growth.offerValue) : "—"} />
                        <SmallStat label="Discount Given" value={growth ? inr.format(growth.discountGiven) : "—"} />
                        <SmallStat label="Negotiations" value={growth?.negotiations} />
                    </div>
                </section>
                
                {/* SECTION 5: CHECKOUT */}
                <section className="border border-border p-6 rounded-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Agentic Checkout</h3>
                        <Button asChild variant="outline" size="sm" className="text-[10px] uppercase font-bold tracking-widest h-8">
                            <Link to="/approvals">Open Approval Queue</Link>
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 border border-border rounded-sm bg-approval-amber/5">
                            <p className="text-[10px] text-approval-amber uppercase font-bold tracking-widest mb-1">Pending Review</p>
                            <p className="text-lg font-bold">{checkout?.pendingApprovals ?? 0} orders</p>
                        </div>
                        <div className="p-4 border border-border rounded-sm bg-approval-amber/5">
                            <p className="text-[10px] text-approval-amber uppercase font-bold tracking-widest mb-1">Payment Pending</p>
                            <p className="text-lg font-bold font-mono">{inr.format(checkout?.paymentPendingValue ?? 0)}</p>
                        </div>
                    </div>
                </section>
            </div>

            <aside className="space-y-8">
                {/* SECTION 6: STATUS */}
                <section className="border border-border p-6 rounded-sm">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground mb-6">System Status</h3>
                    <div className="space-y-3">
                        <StatusRow label="Public Catalog" status="LIVE" />
                        <StatusRow label="Public API" status="OPERATIONAL" />
                        <StatusRow label="Negotiation" status="ENFORCED" />
                        <StatusRow label="Razorpay" status="TEST MODE" />
                    </div>
                </section>

                {/* SECTION 7: PROOF */}
                <section className="border-l-4 border-copper bg-card p-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground mb-2">Proof of Authority</h3>
                    <p className="text-[11px] text-muted-foreground mb-6">Run one complete transaction and inspect every server decision.</p>
                    <Button asChild className="w-full h-10 font-bold uppercase tracking-widest text-[11px]">
                         <Link to="/judge">Open Judge Mode</Link>
                    </Button>
                </section>

                {/* SECTION 8: ACTIVITY */}
                <section className="border border-border p-6 rounded-sm">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground mb-6">Recent Activity</h3>
                    <div className="space-y-4">
                        {audit?.slice(0, 5).map(e => (
                            <div key={e.id} className="text-[10px] font-bold border-b border-border/40 pb-2">
                                <p className="text-foreground uppercase">{e.event.replace(/_/g, ' ')}</p>
                                <p className="text-muted-foreground font-mono mt-0.5">{new Date(e.created_at).toLocaleTimeString()}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </aside>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, icon: Icon }: any) {
    return (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="border border-border p-4 rounded-sm bg-card"
        >
            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <Icon className="size-3.5" />
                <span className="text-[9px] uppercase font-bold tracking-widest">{label}</span>
            </div>
            <p className="text-lg font-bold"><CountUp value={value} /></p>
        </motion.div>
    )
}

function PipelineNode({ label, icon: Icon, active, index = 0 }: any) {
    const shouldReduceMotion = useReducedMotion();
    
    return (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: index * 0.1 }}
          className={cn("flex flex-col items-center gap-2", active ? "text-copper" : "text-muted-foreground")}
        >
            <div className={cn("size-10 flex items-center justify-center border rounded-sm relative overflow-hidden", active ? "bg-copper/10 border-copper" : "bg-card border-border")}>
                <Icon className={cn("size-4 z-10", active && "animate-pulse")} />
                {active && !shouldReduceMotion && (
                  <motion.div 
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-copper/20 to-transparent z-0"
                  />
                )}
            </div>
            <span className="text-[8px] font-bold tracking-widest uppercase">{label}</span>
        </motion.div>
    )
}

function Rule({ label, value, index = 0 }: any) {
    return (
        <motion.div
          initial={{ opacity: 0, x: -5 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: index * 0.1 }}
          className="group"
        >
            <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-widest mb-1">{label}</p>
            <p className="text-sm font-bold group-hover:text-copper transition-colors duration-200">{value}</p>
        </motion.div>
    )
}

function SmallStat({ label, value, index = 0 }: any) {
    return (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: index * 0.1 }}
        >
            <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-widest mb-1">{label}</p>
            <p className="text-sm font-bold font-mono"><CountUp value={value} /></p>
        </motion.div>
    )
}

function StatusRow({ label, status, index = 0 }: any) {
    return (
        <motion.div 
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
          className="flex items-center justify-between text-[10px] font-bold uppercase group"
        >
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
            <div className="flex items-center gap-2">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="size-1 rounded-full bg-verified-green"
                />
                <span className="text-verified-green">{status}</span>
            </div>
        </motion.div>
    )
}
