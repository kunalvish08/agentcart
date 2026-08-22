import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { 
  Loader2, 
  ShieldCheck,
  Database,
  Lock,
  ArrowRight,
  ChevronRight,
  Sun,
  Moon,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useTheme } from "./__root";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · Agentic Commerce Merchant Console" },
      {
        name: "description",
        content:
          "Sign in to the Agentic Commerce merchant console to manage your store, products, inventory and negotiation policies.",
      },
      { property: "og:title", content: "Sign in · Agentic Commerce Merchant Console" },
      {
        property: "og:description",
        content: "Secure merchant sign-in for the Agentic Commerce platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

const DEMO_EMAIL = "demo@technova.test";
const DEMO_PASSWORD = "TechNova@2026";

function ArchitectureNode({ 
  title, 
  labels = [], 
  delay = 0, 
  isPrimary = false,
  isLast = false
}: { 
  title: string, 
  labels?: string[], 
  delay?: number,
  isPrimary?: boolean,
  isLast?: boolean
}) {
  return (
    <div className="flex flex-col items-center">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ 
          opacity: 1, 
          scale: 1,
          boxShadow: isPrimary ? ["0 0 0 0px oklch(from var(--primary) l c h / 0)", "0 0 0 10px oklch(from var(--primary) l c h / 0.1)", "0 0 0 0px oklch(from var(--primary) l c h / 0)"] : "none"
        }}
        transition={{ 
          delay, 
          duration: 0.5,
          boxShadow: isPrimary ? { repeat: Infinity, duration: 3 } : {}
        }}
        className={cn(
          "relative flex flex-col gap-2 rounded-sm border px-5 py-4 w-52",
          isPrimary 
            ? "border-primary/40 bg-primary/10" 
            : isLast 
              ? "border-verified-green/30 bg-verified-green/5"
              : "border-white/10 bg-white/5"
        )}
      >
        <div className="flex items-center justify-between">
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-[0.2em]",
            isPrimary ? "text-primary" : isLast ? "text-verified-green" : "text-white/40"
          )}>
            {title}
          </span>
          {isPrimary && (
            <motion.div 
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="h-1.5 w-1.5 rounded-full bg-primary" 
            />
          )}
        </div>
        
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {labels.map((label, i) => (
              <span key={i} className="text-[9px] font-semibold text-white/30 border border-white/5 rounded px-1.5 py-0.5 uppercase tracking-wider">
                {label}
              </span>
            ))}
          </div>
        )}
      </motion.div>
      {!isLast && (
        <ArchitectureConnector delay={delay + 0.3} />
      )}
    </div>
  );
}

function ArchitectureConnector({ delay = 0 }: { delay?: number }) {
  return (
    <div className="h-8 w-[1px] relative overflow-hidden">
      <motion.div 
        initial={{ height: 0 }}
        animate={{ height: "100%" }}
        transition={{ delay, duration: 0.4, ease: "easeInOut" }}
        className="w-full bg-gradient-to-b from-white/10 to-white/10"
      />
      <motion.div
        initial={{ top: "-10%" }}
        animate={{ top: "110%" }}
        transition={{ delay: delay + 0.5, duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
        className="absolute left-0 w-full h-1/4 bg-primary/40 blur-[1px]"
      />
    </div>
  );
}

function LoginPage() {
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [fullName, setFullName] = useState("");
  const [storeName, setStoreName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) navigate({ to: "/dashboard", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  function switchMode(value: "signin" | "signup") {
    setMode(value);
    if (value === "signup") {
      setEmail("");
      setPassword("");
    } else {
      setEmail(DEMO_EMAIL);
      setPassword(DEMO_PASSWORD);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in successfully");
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: fullName, store_name: storeName },
        },
      });
      if (error) throw error;

      if (!data.session) {
        toast.info("Check your email to confirm your account.");
        setMode("signin");
        return;
      }

      toast.success("Account created successfully");
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-background selection:bg-primary/20 text-foreground overflow-hidden font-sans">
      {/* LEFT: TECHNICAL VISUALIZATION */}
      <div className="relative hidden w-[450px] flex-col bg-[#0A0D12] px-12 py-12 text-white lg:flex border-r border-white/5">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
             style={{ backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        
        <div className="z-10 flex flex-col items-start">
          <Link to="/" className="text-xs font-bold tracking-[0.2em] text-white/90 hover:text-white transition-colors">
            AGENTIC COMMERCE
          </Link>
          <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-primary/60">Merchant Infra v1.0.6</span>
        </div>

        <div className="z-10 mt-auto mb-auto flex flex-col items-center py-12">
          <ArchitectureNode title="CATALOG" labels={["SKU", "INVENTORY"]} delay={0.5} />
          <ArchitectureNode title="POLICY" labels={["PRICE", "LIMITS"]} delay={1.2} />
          <ArchitectureNode title="AI BUYER" labels={["DISCOVERY", "NEGOTIATION"]} delay={1.9} />
          <ArchitectureNode title="SERVER AUTHORITY" labels={["ENFORCEMENT", "VALUATION"]} delay={2.6} isPrimary />
          <ArchitectureNode title="CHECKOUT" labels={["PAYMENT", "GATEWAY"]} delay={3.3} isLast />
        </div>

        <div className="z-10 mt-auto flex flex-wrap gap-x-6 gap-y-2 pt-10 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-primary" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Database Enforced</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-verified-green" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Server Authority</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-approval-amber" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Merchant Scoped</span>
          </div>
        </div>
      </div>

      {/* RIGHT: AUTH PANEL */}
      <div className="relative flex flex-1 flex-col items-center justify-center bg-background px-6 py-12 lg:px-20">
        <div className="absolute top-6 right-6 z-20">
          <button 
            onClick={toggleTheme}
            className="flex size-9 items-center justify-center rounded-sm hover:bg-accent text-muted-foreground hover:text-foreground transition-colors border border-border"
          >
            {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </button>
        </div>

        <div className="z-10 w-full max-w-[400px]">
          <div className="lg:hidden mb-12 flex flex-col items-start">
            <Link to="/" className="text-sm font-bold tracking-tight text-foreground">AGENTIC COMMERCE</Link>
            <span className="mt-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">MERCHANT CONSOLE</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Merchant Console</span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">Sign in to your commerce control plane.</h1>
            <p className="mt-2 text-sm text-muted-foreground">Manage your catalog, policies and AI commerce activity.</p>
          </motion.div>

          <div className="mt-10">
            <div className="flex gap-6 border-b border-border">
              <button 
                onClick={() => switchMode("signin")}
                className={cn(
                  "pb-3 text-xs font-bold uppercase tracking-widest transition-colors relative",
                  mode === "signin" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Sign in
                {mode === "signin" && <motion.div layoutId="tab-indicator" className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary" />}
              </button>
              <button 
                onClick={() => switchMode("signup")}
                className={cn(
                  "pb-3 text-xs font-bold uppercase tracking-widest transition-colors relative",
                  mode === "signup" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Create account
                {mode === "signup" && <motion.div layoutId="tab-indicator" className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary" />}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <AnimatePresence mode="wait">
                {mode === "signup" && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="grid grid-cols-2 gap-4 overflow-hidden"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Full name</Label>
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Aarav Sharma"
                        className="h-10 border-border bg-card text-sm shadow-none focus-visible:ring-primary/20 rounded-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="storeName" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Store name</Label>
                      <Input
                        id="storeName"
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        placeholder="e.g. TechNova"
                        className="h-10 border-border bg-card text-sm shadow-none focus-visible:ring-primary/20 rounded-sm"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="h-10 border-border bg-card text-sm shadow-none focus-visible:ring-primary/20 rounded-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="h-10 border-border bg-card text-sm shadow-none focus-visible:ring-primary/20 rounded-sm"
                />
              </div>

              <Button 
                type="submit" 
                className="mt-2 h-10 w-full bg-primary text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground hover:bg-primary/90 transition-all hover:translate-y-[-1px] rounded-sm" 
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 size-3 animate-spin" /> : null}
                {mode === "signin" ? "Sign in" : "Register Store"}
              </Button>
            </form>

            <AnimatePresence>
              {mode === "signin" && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mt-10 rounded-sm border border-primary/10 bg-primary/5 p-5 relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 p-2 opacity-10">
                    <Database size={40} className="text-primary" />
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">Demo merchant credentials</p>
                  <div className="mt-3 font-mono text-[11px] space-y-1.5 relative z-10">
                    <div className="flex items-center justify-between text-foreground/80">
                      <span className="text-muted-foreground">Email</span>
                      <span className="select-all font-semibold tracking-tight">{DEMO_EMAIL}</span>
                    </div>
                    <div className="flex items-center justify-between text-foreground/80">
                      <span className="text-muted-foreground">Password</span>
                      <span className="select-all font-semibold tracking-tight">{DEMO_PASSWORD}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-[9px] font-medium text-muted-foreground/50 italic">
                    <ShieldCheck size={10} />
                    <span>Seeded with TechNova Store commercial policies</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}