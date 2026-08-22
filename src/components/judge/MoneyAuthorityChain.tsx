import { motion, useReducedMotion } from "framer-motion";
import { 
  ArrowRight, 
  Bot, 
  Search, 
  ShieldCheck, 
  ClipboardCheck, 
  CreditCard, 
  CheckCircle2 
} from "lucide-react";
import { cn } from "@/lib/utils";

const NODES = [
  { label: "AI BUYER", icon: Bot, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  { label: "PUBLIC API", icon: Search, color: "text-muted-foreground", bg: "bg-muted/10", border: "border-border" },
  { label: "POLICY ENGINE", icon: ShieldCheck, color: "text-copper", bg: "bg-copper/10", border: "border-copper/20" },
  { label: "ORDER STATE", icon: ClipboardCheck, color: "text-muted-foreground", bg: "bg-muted/10", border: "border-border" },
  { label: "PAYMENT VERIFICATION", icon: CreditCard, color: "text-muted-foreground", bg: "bg-muted/10", border: "border-border" },
  { label: "RAZORPAY", icon: CheckCircle2, color: "text-verified-green", bg: "bg-verified-green/10", border: "border-verified-green/20" },
];

export function MoneyAuthorityChain() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="w-full py-8 px-4 overflow-x-auto scrollbar-hide">
      <div className="flex items-center justify-between min-w-[800px] gap-2">
        {NODES.map((node, idx) => (
          <div key={node.label} className="flex items-center gap-2 flex-1">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1, duration: 0.5 }}
              className="flex flex-col items-center gap-3 flex-1"
            >
              <div className={cn(
                "w-full aspect-video flex flex-col items-center justify-center border rounded-sm relative overflow-hidden group",
                node.bg,
                node.border
              )}>
                <node.icon className={cn("size-6 mb-2", node.color)} />
                <span className="text-[8px] font-bold tracking-[0.2em] uppercase text-center px-2">
                  {node.label}
                </span>
                
                {/* Proof Badge Placeholder */}
                <div className="absolute top-1 right-1">
                   <div className={cn("size-1.5 rounded-full animate-pulse", 
                     idx === 0 ? "bg-blue-500" : idx === 2 ? "bg-copper" : idx === 5 ? "bg-verified-green" : "bg-muted-foreground/30"
                   )} />
                </div>
              </div>
            </motion.div>
            
            {idx < NODES.length - 1 && (
              <div className="text-muted-foreground/20 relative flex items-center justify-center w-8">
                <ArrowRight className="size-4" />
                {!shouldReduceMotion && (
                  <motion.div
                    initial={{ x: "-100%" }}
                    animate={{ x: "200%" }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: idx * 0.3 }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/30 to-transparent"
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="mt-8 grid md:grid-cols-3 gap-6">
        <ProofCard 
          label="MODEL REQUEST" 
          value="30% discount" 
          status="AI-requested"
          className="border-blue-500/20 bg-blue-500/5"
        />
        <ProofCard 
          label="SERVER POLICY" 
          value="12% maximum" 
          status="Enforced"
          className="border-copper/20 bg-copper/5"
          highlight
        />
        <ProofCard 
          label="FINAL PAYABLE" 
          value="₹48,400" 
          status="Authoritative"
          className="border-verified-green/20 bg-verified-green/5"
        />
      </div>
      
      <div className="mt-6 flex flex-wrap gap-4 justify-center">
        {["Server-computed price", "Policy-enforced discount", "Quote-authoritative order amount", "Server-verified payment"].map((proof, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <CheckCircle2 className="size-3 text-verified-green" />
            {proof}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProofCard({ label, value, status, className, highlight }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("p-4 border rounded-sm flex flex-col items-center text-center", className)}
    >
      <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-1">{label}</span>
      <span className={cn("text-2xl font-bold tracking-tight mb-1", highlight ? "text-copper" : "text-foreground")}>{value}</span>
      <span className="text-[8px] font-bold tracking-widest uppercase opacity-60">{status}</span>
    </motion.div>
  );
}
