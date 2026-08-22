import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ShieldAlert,
  Zap,
  Play,
  Activity,
  ShieldCheck,
  Search,
  History,
  AlertCircle,
  Database,
  Cpu,
  Lock,
  ArrowRight,
  Terminal,
  RefreshCcw,
  Network
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getJudgeProof,
  getJudgeEvidence,
  getJudgeRuns,
  runJudgeDemo,
  resetJudgeDemo
} from "@/lib/judge.functions";
import { CountUp } from "@/components/dashboard/CountUp";
import { MoneyAuthorityChain } from "@/components/judge/MoneyAuthorityChain";
import { ObservabilityTimeline } from "@/components/judge/ObservabilityTimeline";

export const Route = createFileRoute("/_authenticated/judge")({
  component: JudgePage,
});

function JudgePage() {
  const queryClient = useQueryClient();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const fetchProof = useServerFn(getJudgeProof);
  const fetchEvidence = useServerFn(getJudgeEvidence);
  const fetchRuns = useServerFn(getJudgeRuns);
  const triggerDemo = useServerFn(runJudgeDemo);
  const triggerReset = useServerFn(resetJudgeDemo);

  const { data: proof } = useQuery({
    queryKey: ["judge-proof"],
    queryFn: () => fetchProof(),
    refetchInterval: 5000,
  });

  const { data: runs } = useQuery({
    queryKey: ["judge-runs"],
    queryFn: () => fetchRuns(),
  });

  const runMutation = useMutation({
    mutationFn: (chaos: boolean) => triggerDemo({ data: { chaosMode: chaos } }),
    onSuccess: (newRun) => {
      toast.success(newRun.chaos_mode ? "Chaos drill initiated" : "Standard run initiated");
      queryClient.invalidateQueries({ queryKey: ["judge-runs"] });
      setActiveRunId(newRun.id);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => triggerReset(),
    onSuccess: () => {
      toast.success("Demo environment reset");
      queryClient.invalidateQueries({ queryKey: ["judge-proof"] });
      queryClient.invalidateQueries({ queryKey: ["judge-runs"] });
      queryClient.invalidateQueries({ queryKey: ["judge-evidence"] });
    },
  });

  const activeRun = runs?.find((r) => r.id === activeRunId) || runs?.[0];

  return (
    <AppShell
      title="Judge Mode"
      subtitle="Enterprise Observability Console — Deterministic Authority & Failure Simulation."
    >
      <div className="space-y-8 max-w-7xl mx-auto pb-20 px-4">
        
        {/* COMPACT HEADER METRICS */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
             <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-verified-green" />
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Authority Console</h1>
             </div>
             <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
               Autonomous Commerce Observability · Agent-to-Order Integrity
             </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button
              onClick={() => runMutation.mutate(false)}
              disabled={runMutation.isPending}
              variant="outline"
              size="sm"
              className="h-9 text-[10px] font-bold uppercase tracking-widest gap-2 border-border/50 hover:bg-verified-green/5 hover:text-verified-green transition-all"
            >
              <Play className="size-3" /> Execute Std Run
            </Button>
            <Button
              onClick={() => runMutation.mutate(true)}
              disabled={runMutation.isPending}
              variant="outline"
              size="sm"
              className="h-9 text-[10px] font-bold uppercase tracking-widest gap-2 border-destructive/20 text-destructive/80 hover:bg-destructive/10 transition-all"
            >
              <ShieldAlert className="size-3" /> Simulate Chaos
            </Button>
            <Button
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              variant="ghost"
              size="sm"
              className="h-9 text-[10px] font-bold uppercase tracking-widest gap-2 text-muted-foreground hover:text-foreground"
            >
              <RefreshCcw className={cn("size-3", resetMutation.isPending && "animate-spin")} /> Reset
            </Button>
          </div>
        </header>

        {/* TELEMETRY ROW */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TelemetryCard 
            label="Total Runs" 
            value={proof?.total_runs ?? 0} 
            icon={Activity} 
            index={0} 
          />
          <TelemetryCard 
            label="Success Rate" 
            value={proof?.success_rate ?? "0"} 
            suffix="%" 
            icon={ShieldCheck} 
            index={1} 
          />
          <TelemetryCard 
            label="Avg Latency" 
            value={proof?.avg_latency_ms ?? 0} 
            suffix="ms" 
            icon={Zap} 
            index={2} 
          />
          <TelemetryCard 
            label="Auth Violations" 
            value={proof?.authority_violations ?? 0} 
            icon={Lock} 
            index={3} 
            alert={proof?.authority_violations ? proof.authority_violations > 0 : false}
          />
        </section>

        {/* HERO: MONEY AUTHORITY CHAIN */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-border bg-card rounded-sm overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
               <Network className="size-3.5 text-copper" /> Money Authority Chain
            </h3>
            <Badge variant="outline" className="text-[9px] uppercase font-bold tracking-widest text-copper border-copper/30">
              Deterministic Logic
            </Badge>
          </div>
          <div className="overflow-x-auto no-scrollbar">
            <MoneyAuthorityChain />
          </div>
        </motion.section>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* MAIN COLUMN: TRACE TIMELINE */}
          <div className="lg:col-span-8 space-y-8">
            <section className="border border-border bg-card rounded-sm overflow-hidden">
               <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                     <Terminal className="size-3.5 text-blue-500" /> Execution Trace
                  </h3>
                  {activeRun && (
                    <span className="text-[9px] font-mono text-muted-foreground">
                      RUN_ID: {activeRun.id.split("-")[0]} · {activeRun.chaos_mode ? "CHAOS_MODE" : "STANDARD"}
                    </span>
                  )}
               </div>
               
               <div className="p-6">
                 {activeRun ? (
                   <ObservabilityTimeline steps={activeRun.steps || []} />
                 ) : (
                   <div className="py-20 text-center border border-dashed border-border rounded-sm">
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest">
                        No active run data. Execute a run to view trace.
                      </p>
                   </div>
                 )}
               </div>
            </section>
          </div>

          {/* SIDEBAR: TELEMETRY & SPECS */}
          <aside className="lg:col-span-4 space-y-8">
            <section className="border border-border p-6 rounded-sm space-y-6">
               <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground">Authority Evidence</h3>
               
               <div className="space-y-4">
                 <EvidenceItem 
                   label="Public Catalog" 
                   status="VERIFIED" 
                   desc="Rate-limited discovery manifest."
                 />
                 <EvidenceItem 
                   label="Quote Authenticity" 
                   status="ENFORCED" 
                   desc="Server-signed price integrity."
                 />
                 <EvidenceItem 
                   label="Order Immutability" 
                   status="ACTIVE" 
                   desc="Post-payment state transition locked."
                 />
                 <EvidenceItem 
                   label="Razorpay Webhook" 
                   status="SECURE" 
                   desc="SHA-256 signature verification."
                 />
               </div>
            </section>

            <section className="bg-copper/5 border border-copper/20 p-6 rounded-sm">
               <div className="flex items-center gap-2 mb-4">
                 <Database className="size-4 text-copper" />
                 <h3 className="text-[10px] font-bold uppercase tracking-widest text-copper">System Integrity</h3>
               </div>
               <p className="text-[11px] text-copper/70 leading-relaxed mb-6 font-medium italic">
                 "Agentic Commerce delegates discovery to LLMs but retains authority on the server. No agent can modify a price or bypass a payment."
               </p>
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                   <p className="text-[9px] font-bold text-muted-foreground uppercase">Engine</p>
                   <p className="text-xs font-mono">v4.2-Secure</p>
                 </div>
                 <div className="space-y-1">
                   <p className="text-[9px] font-bold text-muted-foreground uppercase">Runtime</p>
                   <p className="text-xs font-mono">Isolated</p>
                 </div>
               </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function TelemetryCard({ label, value, suffix = "", icon: Icon, index, alert }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={cn(
        "border border-border p-5 rounded-sm bg-card group transition-all duration-300 hover:border-copper/40",
        alert && "border-destructive/30 bg-destructive/5"
      )}
    >
      <div className="flex items-center justify-between mb-3 text-muted-foreground">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] group-hover:text-copper transition-colors">{label}</span>
        <Icon className={cn("size-3.5", alert ? "text-destructive" : "group-hover:text-copper")} />
      </div>
      <div className="flex items-baseline gap-1">
        <CountUp 
          value={value} 
          suffix={suffix} 
          className={cn("text-2xl font-bold tracking-tight", alert ? "text-destructive" : "text-foreground")} 
        />
      </div>
    </motion.div>
  );
}

function EvidenceItem({ label, status, desc }: any) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
        <span className="text-[9px] font-bold text-verified-green flex items-center gap-1">
          <ShieldCheck className="size-3" /> {status}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">{desc}</p>
    </div>
  );
}
