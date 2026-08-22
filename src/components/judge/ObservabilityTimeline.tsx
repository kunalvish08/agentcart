import { motion, AnimatePresence } from "framer-motion";
import { 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  Clock, 
  ChevronRight,
  ChevronDown,
  Server,
  User,
  Bot,
  Globe
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Step {
  step_number: number;
  step_type: string;
  tool_name?: string;
  status: string;
  latency_ms: number;
  input_summary?: string;
  output_summary?: string;
  actor?: string; // We'll infer this if missing
}

interface ObservabilityTimelineProps {
  steps: Step[];
}

export function ObservabilityTimeline({ steps }: ObservabilityTimelineProps) {
  const [expandedSteps, setExpandedSteps] = useState<number[]>([1, 5, 11]);

  const toggleStep = (num: number) => {
    setExpandedSteps(prev => 
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
  };

  return (
    <div className="space-y-3">
      {steps.map((step, idx) => {
        const isExpanded = expandedSteps.includes(step.step_number);
        const isNegotiation = step.tool_name === "propose_discount" || step.step_type === "negotiation";
        
        return (
          <motion.div
            key={step.step_number}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className={cn(
              "border border-border rounded-sm bg-card/50 overflow-hidden",
              isNegotiation && "border-copper/30 bg-copper/5"
            )}
          >
            <div 
              className="flex items-center gap-4 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggleStep(step.step_number)}
            >
              <div className="flex items-center gap-2 min-w-[100px]">
                <span className="text-[10px] font-mono font-bold text-muted-foreground">
                  {String(step.step_number).padStart(2, '0')}
                </span>
                <StatusIcon status={step.status} />
              </div>
              
              <div className="flex-1 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <ActorIcon type={inferActor(step)} />
                  <span className="text-xs font-bold tracking-tight uppercase">
                    {step.tool_name || step.step_type}
                  </span>
                  {isNegotiation && (
                    <span className="text-[9px] font-bold text-copper border border-copper/30 px-1.5 py-0.5 rounded-sm uppercase tracking-widest">
                      SERVER OVERRULED
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {step.latency_ms}ms
                  </span>
                  {isExpanded ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}
                </div>
              </div>
            </div>
            
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-border/40"
                >
                  <div className="p-4 space-y-4 font-mono text-[11px]">
                    {isNegotiation ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/20 p-3 rounded-sm">
                        <div>
                          <p className="text-[9px] text-muted-foreground mb-1">BUYER REQUEST</p>
                          <p className="text-blue-500 font-bold">30%</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground mb-1">SERVER CAP</p>
                          <p className="text-copper font-bold">12%</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground mb-1">COUNTER OFFER</p>
                          <p className="text-copper font-bold">12%</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground mb-1">FINAL PRICE</p>
                          <p className="text-foreground font-bold">₹48,400</p>
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-widest">Input</p>
                        <div className="text-muted-foreground break-all bg-muted/10 p-2 border border-border/50">
                          {step.input_summary || "—"}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-widest">Server Output</p>
                        <div className="text-foreground break-all bg-muted/10 p-2 border border-border/50">
                          {step.output_summary || "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed" || status === "ok") return <CheckCircle2 className="size-3.5 text-verified-green" />;
  if (status === "failed") return <AlertCircle className="size-3.5 text-destructive" />;
  if (status === "running" || status === "pending") return <Clock className="size-3.5 text-copper animate-pulse" />;
  return <Circle className="size-3.5 text-muted-foreground" />;
}

function ActorIcon({ type }: { type: string }) {
  if (type === "agent") return <Bot className="size-3 text-blue-500" />;
  if (type === "server") return <Server className="size-3 text-copper" />;
  if (type === "razorpay") return <Globe className="size-3 text-verified-green" />;
  return <User className="size-3 text-muted-foreground" />;
}

function inferActor(step: Step): string {
  const type = step.step_type.toLowerCase();
  const tool = step.tool_name?.toLowerCase() || "";
  
  if (tool.includes("razorpay") || type.includes("payment")) return "razorpay";
  if (tool.includes("policy") || type.includes("server") || type.includes("quote")) return "server";
  if (tool.includes("search") || tool.includes("propose") || tool.includes("checkout")) return "agent";
  
  return "server";
}
