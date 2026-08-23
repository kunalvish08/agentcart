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
  Sparkles,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCheckoutMetrics, getCheckoutAudit } from "@/lib/checkout.functions";
import { getGrowthMetrics, getRevenueAgentMetrics, getWorkspace } from "@/lib/merchant.functions";
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

type Stage = { status: string; state: "idle" | "active" | "pending" | "completed" };

/**
 * Derives Authority Pipeline stage states from the merchant's real checkout audit
 * trail (latest transaction). Presentation-only: no defaults are invented — with no
 * transactions every stage reads a neutral READY state.
 */
function derivePipeline(audit: Array<{ event: string; to_status: string | null; order_id: string | null; created_at: string }> | undefined) {
  const ready: Stage = { status: "READY", state: "idle" };
  const idle = { cat: ready, ai: ready, auth: ready, app: ready, rzp: ready, fin: ready };
  if (!audit || audit.length === 0) return idle;

  const latestOrderId = audit.find((row) => row.order_id)?.order_id ?? null;
  if (!latestOrderId) return idle;

  const rows = audit.filter((row) => row.order_id === latestOrderId);
  const events = new Set(rows.map((row) => row.event));
  const orderStatus = rows.find((row) => row.to_status)?.to_status ?? null;

  const done: Stage = { status: "COMPLETED", state: "completed" };
  const completedOrder = orderStatus === "COMPLETED" || events.has("ORDER_COMPLETED");
  const paymentVerified = completedOrder || events.has("PAYMENT_VERIFIED");
  const paymentCaptured = paymentVerified || events.has("PAYMENT_CAPTURED");
  const paymentStarted =
    paymentCaptured ||
    events.has("PAYMENT_INITIALIZED") ||
    events.has("RAZORPAY_ORDER_CREATED") ||
    orderStatus === "PAYMENT_PENDING";
  const paymentFailed = !paymentVerified && events.has("PAYMENT_FAILED");
  const rejected = orderStatus === "REJECTED" || events.has("REJECTED");
  const cancelled = orderStatus === "CANCELLED" || orderStatus === "EXPIRED";
  const awaitingApproval = orderStatus === "APPROVAL_REQUIRED" && !rejected;
  const approvalNeeded = events.has("APPROVAL_REQUIRED");
  const approved = events.has("APPROVED") || orderStatus === "APPROVED";
  const orderCreated = events.has("ORDER_CREATED") || paymentStarted || completedOrder;

  return {
    cat: done,
    ai: done,
    auth: awaitingApproval || approved || orderCreated || rejected ? done : { status: "ACTIVE", state: "active" as const },
    app: rejected
      ? { status: "REJECTED", state: "pending" as const }
      : awaitingApproval
        ? { status: "PENDING", state: "active" as const }
        : approved || orderCreated
          ? { status: approvalNeeded ? "APPROVED" : "COMPLETED", state: "completed" as const }
          : { status: "PENDING", state: "pending" as const },
    rzp: paymentVerified
      ? { status: "VERIFIED", state: "completed" as const }
      : paymentFailed
        ? { status: "FAILED", state: "pending" as const }
        : paymentStarted
          ? { status: "PENDING", state: "active" as const }
          : { status: "WAITING", state: "pending" as const },
    fin: completedOrder
      ? done
      : rejected || cancelled
        ? { status: orderStatus === "EXPIRED" ? "EXPIRED" : rejected ? "REJECTED" : "CANCELLED", state: "pending" as const }
        : { status: "LOCKED", state: "pending" as const },
  };
}

function DashboardPage() {
  const fetchWorkspace = useServerFn(getWorkspace);
  const fetchGrowth = useServerFn(getGrowthMetrics);
  const fetchCheckout = useServerFn(getCheckoutMetrics);
  const fetchAudit = useServerFn(getCheckoutAudit);

  const { data: data } = useQuery({ queryKey: ["workspace"], queryFn: () => fetchWorkspace() });
  const { data: growth } = useQuery({ queryKey: ["growth-metrics"], queryFn: () => fetchGrowth() });
  const fetchRevenue = useServerFn(getRevenueAgentMetrics);
  const { data: revenue } = useQuery({ queryKey: ["revenue-agent-metrics"], queryFn: () => fetchRevenue(), refetchInterval: 20_000 });
  const { data: checkout } = useQuery({ queryKey: ["checkout-metrics"], queryFn: () => fetchCheckout(), refetchInterval: 15_000 });
  const { data: audit } = useQuery({ queryKey: ["checkout-audit"], queryFn: () => fetchAudit(), refetchInterval: 15_000 });

  const pipeline = derivePipeline(audit);

  const manifestUrl = typeof window === "undefined" ? "/.well-known/agent-manifest" : `${window.location.origin}/.well-known/agent-manifest`;

  return (
    <AppShell
      title={data?.merchant.name ?? "TechNova Store"}
      subtitle="Commerce Control Plane — Catalog, policy, agent activity and transaction authority."
      accountLabel={data?.profile.email ?? undefined}
    >
      <div className="space-y-8 max-w-7xl mx-auto pb-20">
        
        {/* HEADER */}
        <motion.header 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6"
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{data?.merchant.name ?? "TechNova Store"}</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mt-1">'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            hii</p>
          </motion.div>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1.5 rounded-full bg-verified-green/10 px-3 py-1 text-[10px] font-bold text-verified-green">
               <div className="h-1.5 w-1.5 rounded-full bg-verified-green animate-pulse" />
               STORE LIVE
             </div>
             <Badge variant="outline" className="rounded-full h-7 text-[10px] uppercase font-bold tracking-widest">INR</Badge>
          </div>
        </motion.header>

        {/* SECTION 1: HEALTH */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <Stat label="Products" value={data?.stats.totalProducts} icon={Package} index={0} />
          <Stat label="Units" value={data?.stats.totalInventoryUnits} icon={Layers} index={1} />
          <Stat label="Active" value={data?.stats.activeProducts} icon={CheckCircle2} index={2} />
          <Stat label="Value" value={data ? inr.format(data.stats.inventoryValue) : "—"} icon={Store} index={3} />
        </section>

        {/* SECTION 2: AUTHORITY PIPELINE */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: true }}
          className="border border-border bg-card p-6 rounded-sm"
        >
           <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-8">
             Authority Pipeline
           </h3>

           <div className="relative overflow-x-auto pb-4 -mx-6 px-6 scrollbar-hide">
             <div className="flex min-w-max md:min-w-0 md:w-full items-center justify-between gap-1 relative">
               <PipelineNode 
                 label="CAT" 
                 name="Catalog"
                 purpose="Product discovery"
                 status={pipeline.cat.status}
                 icon={Search} 
                 index={0} 
                 state={pipeline.cat.state}
               />
               <PipelineNode 
                 label="AI" 
                 name="AI Buyer"
                 purpose="Agent decision"
                 status={pipeline.ai.status}
                 icon={Bot} 
                 index={1} 
                 state={pipeline.ai.state}
               />
               <PipelineNode 
                 label="AUTH" 
                 name="Server Authority"
                 purpose="Policy + pricing"
                 status={pipeline.auth.status}
                 icon={ShieldCheck} 
                 index={2} 
                 state={pipeline.auth.state}
               />
               <PipelineNode 
                 label="APP" 
                 name="Human Approval"
                 purpose="Merchant control"
                 status={pipeline.app.status}
                 icon={ClipboardCheck} 
                 index={3} 
                 state={pipeline.app.state}
               />
               <PipelineNode 
                 label="RZP" 
                 name="Razorpay"
                 purpose="Payment verification"
                 status={pipeline.rzp.status}
                 icon={CreditCard} 
                 index={4} 
                 state={pipeline.rzp.state}
               />
               <PipelineNode 
                 label="FIN" 
                 name="Settlement"
                 purpose="Final order state"
                 status={pipeline.fin.status}
                 icon={CheckCircle2} 
                 index={5} 
                 state={pipeline.fin.state}
               />

             </div>
           </div>
        </motion.section>

        <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                {/* SECTION 3: RULES */}
                <section className="border border-border p-6 rounded-sm">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground flex items-center gap-2 mb-6">
                       <ShieldCheck className="size-4 text-copper" /> Commercial Rules
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-8">
                        <Rule label="Max Discount" value={`${data?.policy.max_discount_percent}%`} index={0} />
                        <Rule label="Max Order" value={data ? inr.format(data.policy.max_order_value) : "—"} index={1} />
                        <Rule label="Approval" value={data ? inr.format(data.policy.approval_required_above) : "—"} index={2} />
                        <Rule label="Negotiation" value={data?.policy.allow_negotiation ? "ON" : "OFF"} index={3} />
                        <Rule label="Upsell" value={data?.policy.allow_upsell ? "ON" : "OFF"} index={4} />
                    </div>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="mt-8 pt-6 border-t border-border flex items-center justify-between"
                    >
                         <p className="text-xs font-bold text-copper uppercase tracking-widest italic">AI may request. Policy decides.</p>
                    </motion.div>
                </section>

                {/* SECTION 4: NEGOTIATION */}
                <section className="border border-border p-6 rounded-sm">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground mb-6 flex items-center gap-2">
                        <TrendingUp className="size-4 text-copper" /> Negotiation & Growth
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                        <SmallStat label="List Value" value={growth ? inr.format(growth.listValue) : "—"} index={0} />
                        <SmallStat label="Offer" value={growth ? inr.format(growth.offerValue) : "—"} index={1} />
                        <SmallStat label="Discount" value={growth ? inr.format(growth.discountGiven) : "—"} index={2} />
                        <SmallStat label="Count" value={growth?.negotiations} index={3} />
                    </div>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="mt-6 pt-4 border-t border-border/40"
                    >
                         <p className="text-[9px] font-bold text-copper uppercase tracking-widest italic">
                           All discounts bounded by merchant policy.
                         </p>
                    </motion.div>
                </section>

                {/* SECTION 4B: REVENUE AGENT */}
                <section className="border border-border p-6 rounded-sm">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground mb-6 flex items-center gap-2">
                        <Sparkles className="size-4 text-copper" /> Revenue Agent
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                        <SmallStat label="Opportunities" value={revenue?.opportunities} index={0} />
                        <SmallStat label="Shown" value={revenue?.shown} index={1} />
                        <SmallStat label="Accepted" value={revenue?.accepted} index={2} />
                        <SmallStat label="Upsell" value={revenue?.upsellAccepted} index={3} />
                        <SmallStat label="Cross-sell" value={revenue?.crossSellAccepted} index={4} />
                        <SmallStat label="Accepted Value" value={revenue ? inr.format(revenue.acceptedValue) : "—"} index={5} />
                    </div>
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="mt-6 pt-4 border-t border-border/40"
                    >
                         <p className="text-[9px] font-bold text-copper uppercase tracking-widest italic">
                           AI recommends. Policy and server pricing decide.
                         </p>
                    </motion.div>
                </section>


                
                {/* SECTION 5: CHECKOUT */}
                <section className="border border-border p-6 rounded-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Agentic Checkout</h3>
                        <Button asChild variant="outline" size="sm" className="text-[10px] uppercase font-bold tracking-widest h-8 hover:-translate-y-0.5 transition-transform">
                            <Link to="/approvals">Open Approval Queue</Link>
                        </Button>
                    </div>
                    <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                        {["Requests", "Approvals", "Payment", "Verified", "Completed"].map((step, idx) => (
                           <motion.div 
                             key={step}
                             initial={{ opacity: 0, x: -5 }}
                             whileInView={{ opacity: 1, x: 0 }}
                             transition={{ duration: 0.3, delay: idx * 0.1 }}
                             className="flex items-center gap-2 shrink-0"
                           >
                             <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">{step}</span>
                             {idx < 4 && <ArrowRight className="size-2 text-muted-foreground/30" />}
                           </motion.div>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          whileInView={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.4 }}
                          className="p-4 border border-border rounded-sm bg-approval-amber/5"
                        >
                            <p className="text-[10px] text-approval-amber uppercase font-bold tracking-widest mb-1">Pending Review</p>
                            <p className="text-lg font-bold"><CountUp value={checkout?.pendingApprovals ?? 0} /> orders</p>
                        </motion.div>
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          whileInView={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.4, delay: 0.1 }}
                          className="p-4 border border-border rounded-sm bg-approval-amber/5 relative overflow-hidden"
                        >
                            <motion.div 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: [0, 0.4, 0] }}
                              transition={{ duration: 2 }}
                              className="absolute inset-0 bg-approval-amber/10"
                            />
                            <div className="text-[10px] text-approval-amber uppercase font-bold tracking-widest mb-1 flex items-center gap-2">
                                Payment Pending
                                <motion.div 
                                  animate={{ scale: [1, 1.2, 1] }}
                                  transition={{ duration: 2, repeat: Infinity }}
                                  className="size-1 rounded-full bg-approval-amber"
                                />
                            </div>
                            <p className="text-lg font-bold font-mono"><CountUp value={inr.format(checkout?.paymentPendingValue ?? 0)} /></p>
                        </motion.div>
                    </div>
                </section>
            </div>

            <aside className="space-y-8">
                {/* SECTION 6: STATUS */}
                <section className="border border-border p-6 rounded-sm">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground mb-6">System Status</h3>
                    <div className="space-y-3">
                        <StatusRow label="Public Catalog" status="LIVE" index={0} />
                        <StatusRow label="Public API" status="OPERATIONAL" index={1} />
                        <StatusRow label="Negotiation" status="ENFORCED" index={2} />
                        <StatusRow label="Razorpay" status="TEST MODE" index={3} />
                    </div>
                </section>

                {/* SECTION 7: PROOF */}
                <motion.section 
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6 }}
                  className="border-l-4 border-copper bg-card p-6"
                >
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground mb-2">Proof of Authority</h3>
                    <p className="text-[11px] text-muted-foreground mb-6">Run one complete transaction and inspect every server decision.</p>
                    <div className="space-y-2 mb-6">
                        {["11 STEPS", "5 TOOL CALLS", "SERVER PRICING", "VERIFIED PAYMENT"].map((text, idx) => (
                           <motion.div 
                             key={text}
                             initial={{ opacity: 0, x: -10 }}
                             whileInView={{ opacity: 1, x: 0 }}
                             transition={{ duration: 0.3, delay: idx * 0.1 + 0.3 }}
                             className={cn(
                               "text-[9px] font-bold tracking-widest uppercase flex items-center gap-2",
                               text === "VERIFIED PAYMENT" ? "text-verified-green" : "text-muted-foreground"
                             )}
                           >
                             <div className={cn("size-1 rounded-full", text === "VERIFIED PAYMENT" ? "bg-verified-green" : "bg-muted-foreground/30")} />
                             {text}
                           </motion.div>
                        ))}
                    </div>
                    <Button asChild className="w-full h-10 font-bold uppercase tracking-widest text-[11px] hover:-translate-y-0.5 transition-transform duration-200">
                         <Link to="/judge">Open Judge Mode</Link>
                    </Button>
                </motion.section>

                {/* SECTION 8: ACTIVITY */}
                <motion.section 
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  transition={{ duration: 0.8 }}
                  className="border border-border p-6 rounded-sm"
                >
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground mb-6">Recent Activity</h3>
                    <div className="space-y-4">
                        {audit?.slice(0, 5).map((e, idx) => (
                            <motion.div 
                              key={e.id}
                              initial={{ opacity: 0, x: 5 }}
                              whileInView={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.4, delay: idx * 0.1 }}
                              className="text-[10px] font-bold border-b border-border/40 pb-2 relative group"
                            >
                                {idx === 0 && (
                                  <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: [0.2, 0.6, 0.2] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="absolute -left-2 top-2 size-1 rounded-full bg-copper"
                                  />
                                )}
                                <p className="text-foreground uppercase group-hover:text-copper transition-colors">{e.event.replace(/_/g, ' ')}</p>
                                <p className="text-muted-foreground font-mono mt-0.5">{new Date(e.created_at).toLocaleTimeString()}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.section>
            </aside>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, icon: Icon, index = 0 }: any) {
    return (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: index * 0.1 }}
          className="border border-border p-4 rounded-sm bg-card hover:border-copper/30 transition-colors"
        >
            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <Icon className="size-3.5" />
                <span className="text-[9px] uppercase font-bold tracking-widest">{label}</span>
            </div>
            <p className="text-lg font-bold"><CountUp value={value} /></p>
        </motion.div>
    )
}

function PipelineNode({ label, name, purpose, status, icon: Icon, state, index = 0 }: any) {
    const shouldReduceMotion = useReducedMotion();
    const isActive = state === "active";
    const isCompleted = state === "completed";
    
    return (
        <div className="flex-1 flex flex-col items-center relative">
            {/* Horizontal Connector Line (Desktop) */}
            {index < 5 && (
                <div className="hidden md:block absolute top-6 left-[60%] w-[80%] h-[1px] bg-border z-0">
                    {isCompleted && (
                        <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 0.8, delay: index * 0.1 }}
                            className="h-full bg-verified-green"
                        />
                    )}
                </div>
            )}

            <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className={cn(
                    "relative z-10 size-12 flex items-center justify-center border rounded-sm mb-3 transition-all duration-300",
                    isActive ? "bg-copper/20 border-copper shadow-[0_0_20px_rgba(213,155,98,0.2)]" : 
                    isCompleted ? "bg-verified-green/10 border-verified-green/40 text-verified-green" : 
                    "bg-card border-border text-muted-foreground"
                )}
            >
                <Icon className={cn("size-5", isActive && "text-copper animate-pulse")} />
                
                {/* Active Pulse Ring */}
                {isActive && (
                    <motion.div 
                        animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 border border-copper rounded-sm"
                    />
                )}
            </motion.div>

            <div className="text-center w-24">
                <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[9px] font-mono font-bold text-muted-foreground/60">{label}</span>
                    <h4 className={cn("text-[10px] font-bold tracking-tight uppercase", isActive ? "text-copper" : "text-foreground")}>{name}</h4>
                </div>
                <div className={cn(
                    "mt-2 text-[8px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full border inline-block",
                    isActive ? "bg-copper/10 border-copper/30 text-copper" :
                    isCompleted ? "bg-verified-green/10 border-verified-green/30 text-verified-green" :
                    "bg-muted/10 border-border text-muted-foreground/50"
                )}>
                    {status}
                </div>
            </div>
        </div>
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

