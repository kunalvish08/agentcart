import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ArrowRight, Activity, Zap, Info, Shield, Scale } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getWorkspace, updatePolicy } from "@/lib/merchant.functions";
import { CountUp } from "@/components/dashboard/CountUp";

export const Route = createFileRoute("/_authenticated/policies")({
  component: PoliciesPage,
});

type PolicyForm = {
  max_discount_percent: string;
  max_order_value: string;
  approval_required_above: string;
  allow_negotiation: boolean;
  allow_upsell: boolean;
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4 },
  },
};

function PoliciesPage() {
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(getWorkspace);
  const savePolicy = useServerFn(updatePolicy);

  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => fetchWorkspace() });
  const [form, setForm] = useState<PolicyForm | null>(null);

  useEffect(() => {
    if (workspace.data && form === null) {
      setForm({
        max_discount_percent: String(workspace.data.policy.max_discount_percent),
        max_order_value: String(workspace.data.policy.max_order_value),
        approval_required_above: String(workspace.data.policy.approval_required_above),
        allow_negotiation: workspace.data.policy.allow_negotiation,
        allow_upsell: workspace.data.policy.allow_upsell,
      });
    }
  }, [workspace.data, form]);

  const mutation = useMutation({
    mutationFn: (state: PolicyForm) =>
      savePolicy({
        data: {
          max_discount_percent: Number(state.max_discount_percent),
          max_order_value: Number(state.max_order_value),
          approval_required_above: Number(state.approval_required_above),
          allow_negotiation: state.allow_negotiation,
          allow_upsell: state.allow_upsell,
        },
      }),
    onSuccess: () => {
      toast.success("Policies saved");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save policies"),
  });

  if (!workspace.data || !form) {
    return (
      <AppShell title="Commercial Policies" subtitle="Loading governance configuration...">
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary/50" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Commercial Policies"
      subtitle="Define the commercial boundaries enforced server-side for all AI transactions."
      accountLabel={workspace.data.profile.email ?? undefined}
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-8 max-w-6xl pb-20"
      >
        {/* Header Indicators */}
        <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-4 border-b border-border/40 pb-6">
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
            <Shield className="size-3 text-blue-400" />
            <span className="text-[10px] font-bold tracking-widest text-blue-400 uppercase">SERVER-AUTHORITATIVE</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <ShieldCheck className="size-3 text-emerald-400" />
            <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase">ENFORCED</span>
          </div>
        </motion.div>

        {/* Section 1: Negotiation & Order Limits */}
        <motion.section variants={itemVariants} className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-foreground">Negotiation & Order Limits</h2>
            <p className="text-xs text-muted-foreground">
              Commercial limits are stored in PostgreSQL and enforced by Server Authority logic.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Max Discount */}
            <div className="group rounded-sm border border-border bg-card/50 p-5 transition-colors hover:border-border/80">
              <div className="mb-4 space-y-1">
                <Label htmlFor="discount" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Max discount (%)</Label>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-mono font-medium text-foreground">
                    <CountUp value={form.max_discount_percent} />%
                  </span>
                </div>
              </div>
              <Input
                id="discount"
                type="number"
                min={0}
                max={100}
                step="0.01"
                className="rounded-sm border-border bg-background focus-visible:ring-primary/20 h-10 font-mono mb-3"
                value={form.max_discount_percent}
                onChange={(e) => setForm({ ...form, max_discount_percent: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                The absolute ceiling for any AI-negotiated discount.
              </p>
            </div>

            {/* Max Order Value */}
            <div className="group rounded-sm border border-border bg-card/50 p-5 transition-colors hover:border-border/80">
              <div className="mb-4 space-y-1">
                <Label htmlFor="maxOrder" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Max order value (INR)</Label>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-mono font-medium text-foreground uppercase">
                    ₹<CountUp value={form.max_order_value} />
                  </span>
                </div>
              </div>
              <Input
                id="maxOrder"
                type="number"
                min={0}
                step="1"
                className="rounded-sm border-border bg-background focus-visible:ring-primary/20 h-10 font-mono mb-3"
                value={form.max_order_value}
                onChange={(e) => setForm({ ...form, max_order_value: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Maximum transaction size allowed for autonomous agents.
              </p>
            </div>

            {/* Approval Threshold */}
            <div className="group rounded-sm border border-border bg-card/50 p-5 transition-colors hover:border-border/80">
              <div className="mb-4 space-y-1">
                <Label htmlFor="approval" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Approval threshold (INR)</Label>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-mono font-medium text-amber-500/90 uppercase">
                    ₹<CountUp value={form.approval_required_above} />
                  </span>
                </div>
              </div>
              <Input
                id="approval"
                type="number"
                min={0}
                step="1"
                className="rounded-sm border-border bg-background focus-visible:ring-primary/20 h-10 font-mono mb-3"
                value={form.approval_required_above}
                onChange={(e) => setForm({ ...form, approval_required_above: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Orders above this amount require manual merchant intervention.
              </p>
            </div>
          </div>

          {/* Relationship Trace */}
          <div className="flex items-center justify-center gap-4 py-4 px-6 bg-muted/20 border border-border/40 rounded-sm overflow-hidden">
            <span className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground uppercase whitespace-nowrap">DISCOUNT CAP</span>
            <ArrowRight className="size-3 text-muted-foreground/30 flex-shrink-0" />
            <span className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground uppercase whitespace-nowrap">ORDER LIMIT</span>
            <ArrowRight className="size-3 text-muted-foreground/30 flex-shrink-0" />
            <span className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground uppercase whitespace-nowrap">APPROVAL GATE</span>
          </div>
        </motion.section>

        {/* Section 2: Agent Capabilities */}
        <motion.section variants={itemVariants} className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-foreground">Agent Capabilities</h2>
            <p className="text-xs text-muted-foreground">
              Define the range of autonomous actions permitted for AI consumers.
            </p>
          </div>

          <div className="divide-y divide-border border border-border bg-card/50 rounded-sm">
            <div className="flex items-center justify-between p-6">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-foreground">Allow negotiation</p>
                <p className="text-[11px] text-muted-foreground max-w-md">
                  Permits AI buyers to negotiate within the max discount cap.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-[10px] font-mono font-bold tracking-widest ${form.allow_negotiation ? 'text-emerald-500' : 'text-muted-foreground/60'}`}>
                  {form.allow_negotiation ? 'ON' : 'OFF'}
                </span>
                <Switch
                  checked={form.allow_negotiation}
                  onCheckedChange={(checked) => setForm({ ...form, allow_negotiation: checked })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-6">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-foreground">Allow upsell</p>
                <p className="text-[11px] text-muted-foreground max-w-md">
                  Permits AI buyers to receive product recommendations.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-[10px] font-mono font-bold tracking-widest ${form.allow_upsell ? 'text-emerald-500' : 'text-muted-foreground/60'}`}>
                  {form.allow_upsell ? 'ON' : 'OFF'}
                </span>
                <Switch
                  checked={form.allow_upsell}
                  onCheckedChange={(checked) => setForm({ ...form, allow_upsell: checked })}
                />
              </div>
            </div>
          </div>
        </motion.section>

        {/* Section 3: Server Authority */}
        <motion.section variants={itemVariants}>
          <div className="rounded-sm border border-blue-500/30 bg-blue-500/5 p-8 flex flex-col md:flex-row gap-6 items-start md:items-center">
            <div className="p-3 bg-blue-500/10 rounded-sm border border-blue-500/20">
              <Shield className="size-6 text-blue-400" />
            </div>
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">SERVER-AUTHORITATIVE</h3>
                <div className="h-px flex-1 bg-blue-500/20" />
              </div>
              <p className="text-xs text-blue-900/70 dark:text-blue-100/70 leading-relaxed max-w-2xl italic">
                "AI agents may request commercial actions, but final pricing, policy enforcement and checkout authorization remain controlled by the merchant server."
              </p>
            </div>
          </div>
        </motion.section>

        {/* Section 4: Policy Simulation */}
        <motion.section variants={itemVariants} className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-foreground">Test Policy</h2>
            <p className="text-xs text-muted-foreground">
              Evaluate a transaction against the current server-side commercial rules.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
            <div className="rounded-sm border border-border bg-card/50 p-6 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Product</Label>
                  <div className="h-10 px-3 flex items-center bg-muted/30 border border-border rounded-sm text-[11px] text-muted-foreground">
                    Select a product for simulation...
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Order value (INR)</Label>
                  <Input type="number" placeholder="0" className="rounded-sm border-border bg-background focus-visible:ring-primary/20 h-10 font-mono" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Requested discount (%)</Label>
                <Input type="number" placeholder="0.00" className="rounded-sm border-border bg-background focus-visible:ring-primary/20 h-10 font-mono" />
              </div>
              <Button variant="outline" className="w-full sm:w-auto rounded-sm font-bold uppercase tracking-[0.2em] px-8 border-border/60 hover:bg-muted">
                Evaluate
              </Button>
            </div>

            <div className="rounded-sm border border-border bg-muted/10 p-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-border/40">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Simulation Result</span>
                  <div className="px-2 py-0.5 bg-muted/40 rounded-sm text-[9px] font-mono text-muted-foreground uppercase">PENDING</div>
                </div>
                
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Server Decision</span>
                    <div className="text-[11px] font-mono text-muted-foreground/40 italic">—</div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Reason</span>
                    <div className="text-[11px] font-mono text-muted-foreground/40 italic">—</div>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-border/40">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50 italic">
                  <Info className="size-3" />
                  <span>UI Shell: Connect backend logic to enable simulation.</span>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Section 5: Change Control */}
        <motion.section variants={itemVariants} className="pt-8">
          <div className="rounded-sm border border-border bg-muted/30 p-8 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-4 flex-1 w-full md:w-auto">
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-foreground">Policy Changes</h3>
                <p className="text-[11px] text-muted-foreground">
                  Changes apply to subsequent AI commerce transactions.
                </p>
              </div>
              
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-6 sm:gap-12">
                <div className="space-y-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Configuration</span>
                  <div className="text-[10px] font-mono text-foreground uppercase">V2.4.0-STABLE</div>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Last Updated</span>
                  <div className="text-[10px] font-mono text-foreground uppercase">
                    {workspace.data.agentApi.lastRequestAt ? new Date(workspace.data.agentApi.lastRequestAt).toLocaleDateString() : 'AUG 2026'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 w-full md:w-auto">
              <Button 
                onClick={() => mutation.mutate(form)}
                disabled={mutation.isPending}
                className="w-full md:w-auto rounded-sm font-bold uppercase tracking-[0.2em] px-10 h-12 bg-primary hover:bg-primary/90"
              >
                {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Zap className="mr-2 size-4 fill-current" />}
                Commit Changes
              </Button>
            </div>
          </div>
        </motion.section>
      </motion.div>
    </AppShell>
  );
}
