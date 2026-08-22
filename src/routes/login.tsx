import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { 
  Loader2, 
  ArrowDown, 
  CheckCircle2, 
  ChevronRight,
  ShieldCheck,
  Database,
  Lock,
  ArrowRight
} from "lucide-react";
import { motion } from "framer-motion";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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

function ArchitectureNode({ title, sub, delay = 0 }: { title: string, sub: string, delay?: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="flex flex-col gap-1 rounded border border-white/10 bg-white/5 p-3"
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{title}</span>
      <span className="text-xs font-medium text-white/80">{sub}</span>
    </motion.div>
  );
}

function ArchitectureConnector({ delay = 0 }: { delay?: number }) {
  return (
    <div className="flex h-6 w-full items-center justify-center">
      <motion.div 
        initial={{ height: 0 }}
        animate={{ height: "100%" }}
        transition={{ delay, duration: 0.5 }}
        className="w-[1px] bg-white/10"
      />
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [fullName, setFullName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);

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
        toast.success("Signed in");
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
        toast.info("Check your email to confirm your account before signing in.");
        setMode("signin");
        return;
      }

      toast.success("Account created");
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-background selection:bg-primary/10">
      {/* LEFT SIDE — PRODUCT CONTEXT */}
      <div className="relative hidden w-full max-w-sm flex-col bg-slate-950 p-10 text-white lg:flex xl:max-w-md">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        
        <div className="z-10 flex flex-col items-start leading-none">
          <Link to="/" className="text-sm font-bold tracking-tight text-white transition-opacity hover:opacity-80">
            AGENTIC COMMERCE
          </Link>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">MERCHANT CONTROL PLANE</span>
        </div>

        <div className="z-10 mt-32">
          <motion.h2 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-semibold leading-[1.1] tracking-tight"
          >
            Your catalog.<br />
            Your policies.<br />
            Your authority.
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-6 text-sm leading-relaxed text-white/50"
          >
            Configure the commercial rules that AI buyers must operate within.
          </motion.p>
        </div>

        <div className="z-10 mt-20 max-w-[240px]">
          <ArchitectureNode title="CATALOG" sub="Products · Inventory" delay={0.3} />
          <ArchitectureConnector delay={0.4} />
          <ArchitectureNode title="POLICY" sub="Discount · Order limits" delay={0.5} />
          <ArchitectureConnector delay={0.6} />
          <ArchitectureNode title="AGENT API" sub="Machine-readable commerce" delay={0.7} />
          <ArchitectureConnector delay={0.8} />
          <ArchitectureNode title="CHECKOUT" sub="Server-authorized order" delay={0.9} />
        </div>

        <div className="mt-auto z-10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[9px] font-bold text-green-400">
              <div className="h-1 w-1 rounded-full bg-green-400 animate-pulse" />
              SYSTEM
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Secure merchant environment</span>
          </div>
          <p className="text-[10px] font-medium text-white/30 uppercase tracking-tight">
            Authentication and authorization are enforced server-side.
          </p>
        </div>
      </div>

      {/* RIGHT SIDE — AUTHENTICATION */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-12 lg:px-20 xl:px-32">
        {/* Subtle background structure */}
        <div className="absolute inset-0 z-0 opacity-[0.02] pointer-events-none" 
             style={{ backgroundImage: 'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        
        <div className="z-10 w-full max-w-[400px]">
          <div className="lg:hidden mb-12 flex flex-col items-start leading-none">
            <Link to="/" className="text-sm font-bold tracking-tight text-foreground">AGENTIC COMMERCE</Link>
            <span className="mt-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">MERCHANT CONTROL PLANE</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">MERCHANT ACCESS</span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Sign in to your store</h1>
            <p className="mt-2 text-sm text-muted-foreground">Manage your catalog, policies and AI commerce controls.</p>
          </motion.div>

          <div className="mt-10">
            <div className="flex border-b border-border">
              <button 
                onClick={() => switchMode("signin")}
                className={cn(
                  "px-4 py-2 text-xs font-semibold tracking-tight transition-colors relative",
                  mode === "signin" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Sign in
                {mode === "signin" && <motion.div layoutId="auth-tab" className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-primary" />}
              </button>
              <button 
                onClick={() => switchMode("signup")}
                className={cn(
                  "px-4 py-2 text-xs font-semibold tracking-tight transition-colors relative",
                  mode === "signup" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Create account
                {mode === "signup" && <motion.div layoutId="auth-tab" className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-primary" />}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              {mode === "signup" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">Full name</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Aarav Sharma"
                      autoComplete="name"
                      className="h-11 border-border/60 bg-transparent text-sm shadow-none focus-visible:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="storeName" className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">Store name</Label>
                    <Input
                      id="storeName"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="My Store"
                      className="h-11 border-border/60 bg-transparent text-sm shadow-none focus-visible:ring-primary/20"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="h-11 border-border/60 bg-transparent text-sm shadow-none focus-visible:ring-primary/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="h-11 border-border/60 bg-transparent text-sm shadow-none focus-visible:ring-primary/20"
                />
              </div>

              <Button type="submit" className="h-11 w-full text-xs font-bold uppercase tracking-widest shadow-md" disabled={loading}>
                {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>

            {mode === "signup" && (
              <p className="mt-4 text-center text-[11px] font-medium text-muted-foreground italic">
                Create a merchant workspace and configure your commerce policies.
              </p>
            )}

            {mode === "signin" && (
              <div className="mt-12 rounded-lg border border-border/60 bg-muted/30 p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Demo merchant</p>
                <div className="mt-3 font-mono text-xs text-foreground/80">
                  <div className="flex items-center justify-between border-b border-border/40 py-1.5">
                    <span className="text-muted-foreground">Email</span>
                    <span>{DEMO_EMAIL}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-muted-foreground">Password</span>
                    <span>{DEMO_PASSWORD}</span>
                  </div>
                </div>
                <p className="mt-3 text-[10px] font-medium text-muted-foreground/70">
                   Owns the seeded TechNova Store data.
                </p>
              </div>
            )}
          </div>

          <div className="mt-20 border-t border-border/40 pt-10">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SECURE ACCESS</p>
            <div className="mt-6 space-y-4">
              {[
                { icon: Database, text: "Database-enforced authentication" },
                { icon: ShieldCheck, text: "Merchant-scoped authorization" },
                { icon: Lock, text: "Server-side commerce controls" }
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <item.icon size={14} className="text-primary/60" />
                  <span className="text-[11px] font-semibold tracking-tight text-foreground/70">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
