import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Search, Scale, CreditCard, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useTheme } from "./__root";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agentic Commerce Platform · Obsidian Commerce" },
      { name: "description", content: "AI-native agentic commerce infrastructure with server-authoritative control." },
    ],
  }),
  component: Landing,
});

function ObsidianNode({ title, subtitle, active = false, copper = false, delay = 0 }: { title: string, subtitle?: string, active?: boolean, copper?: boolean, delay?: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5 }}
      className={cn(
        "relative rounded-sm border p-4 transition-all duration-500 overflow-hidden",
        active ? (copper ? "border-primary bg-accent shadow-[0_0_20px_rgba(213,155,98,0.1)]" : "border-border bg-accent") : "border-border bg-card",
      )}
    >
      {active && copper && (
        <motion.div 
          animate={{ opacity: [0.1, 0.2, 0.1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute inset-0 bg-primary/10"
        />
      )}
      <p className={cn("text-[10px] font-bold uppercase tracking-[0.2em]", active ? "text-foreground" : "text-muted-foreground")}>{title}</p>
      {subtitle && <p className={cn("mt-1 text-[11px] font-mono", copper ? "text-primary" : "text-foreground/80")}>{subtitle}</p>}
    </motion.div>
  );
}

function Signal() {
  return (
    <div className="relative h-8 flex justify-center">
      <motion.div 
        animate={{ y: [0, 32], opacity: [0, 1, 0] }}
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        className="w-px h-8 bg-primary"
      />
    </div>
  );
}


function Landing() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 font-sans">
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-tight text-foreground">Agentic Commerce</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground hidden sm:block">AI INFRASTRUCTURE</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-8 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            <Link to="/agent-api" className="hidden sm:block hover:text-foreground transition-colors">Agent API</Link>
            <Link to="/login" className="hover:text-foreground transition-colors">Merchant Console</Link>
            <button 
              onClick={toggleTheme}
              className="flex size-8 items-center justify-center rounded-sm hover:bg-accent transition-colors"
            >
              {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <section className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">AI COMMERCE INFRASTRUCTURE</span>
            <h1 className="mt-6 text-4xl sm:text-6xl font-semibold leading-[1.05] tracking-tight text-foreground">
              Let AI buyers shop your store. <br />
              <span className="text-muted-foreground">Keep the money under your control.</span>
            </h1>
            <p className="mt-6 sm:mt-10 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl">
              Expose your catalog to external AI agents while keeping pricing, policy, checkout and payment authority on your server.
            </p>
            <div className="mt-8 sm:mt-12 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <Button asChild className="h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-none">
                <Link to="/login">Open Merchant Console</Link>
              </Button>
              <Button asChild variant="outline" className="h-12 border-border bg-transparent text-foreground hover:bg-accent rounded-none">
                <Link to="/agent-api">Explore Agent API</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-1 p-8 border border-border bg-card rounded-sm relative overflow-hidden">
            <ObsidianNode title="AI BUYER" subtitle="Laptop under ₹60k" delay={0.2} />
            <Signal />
            <ObsidianNode title="PUBLIC AGENT API" subtitle="/search · /quote · /negotiate" delay={0.4} />
            <Signal />
            <ObsidianNode title="SERVER AUTHORITY" subtitle="PRICE · INVENTORY · POLICY · CHECKOUT" active copper delay={0.6} />
            <Signal />
            <ObsidianNode title="RAZORPAY" subtitle="PAYMENT VERIFICATION" delay={0.8} />
            <div className="relative h-8 flex justify-center">
              <motion.div 
                animate={{ y: [0, 32], opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="w-px h-8 bg-verified-green"
              />
            </div>
            <ObsidianNode title="VERIFIED ORDER" subtitle="COMPLETED" active delay={1.0} />
          </div>

        </section>

        <section className="py-20 sm:py-32 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
          <div>
            <h2 className="text-4xl font-semibold tracking-tight leading-[1.1]">
              AI decides what to ask. <br />
              <span className="text-muted-foreground">Your server decides what can happen.</span>
            </h2>
            <div className="mt-8 sm:mt-12 flex flex-col sm:flex-row sm:items-center gap-8 sm:gap-16 border-t border-border pt-8 sm:pt-12">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">AI BUYER</p>
                <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                  <li>Discover</li>
                  <li>Search</li>
                  <li>Quote</li>
                  <li>Negotiate</li>
                  <li>Checkout</li>
                </ul>
              </div>
              <div className="text-primary font-mono text-sm">REQUEST ≠ AUTHORITY</div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">SERVER AUTHORITY</p>
                <ul className="mt-6 space-y-3 text-sm text-foreground">
                  <li>Price</li>
                  <li>Inventory</li>
                  <li>Discount limits</li>
                  <li>Order state</li>
                  <li>Payment verification</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-32 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="border border-border p-8 bg-card">
            <Search className="text-primary" />
            <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.2em]">01 DISCOVERABLE</h3>
            <p className="mt-4 text-[11px] font-mono text-primary">Make your catalog readable by machines.</p>
            <p className="mt-8 text-sm text-muted-foreground">External AI buyers can discover products through a public API designed for LLM tool-calling.</p>
          </div>
          <div className="border border-border p-8 bg-card">
            <Scale className="text-primary" />
            <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.2em]">02 BOUNDED</h3>
            <p className="mt-4 text-[11px] font-mono text-primary">Let agents negotiate without giving them pricing authority.</p>
            <p className="mt-8 text-sm text-muted-foreground">Merchant policies determine discount limits. The AI buyer requests, the server enforces.</p>
            <div className="mt-8 h-12 flex items-center justify-between px-4 border border-border bg-background overflow-hidden relative">
               <motion.div 
                 animate={{ x: [0, 150] }}
                 transition={{ repeat: Infinity, duration: 3, ease: "easeIn" }}
                 className="text-[10px] font-mono text-foreground/70"
               >
                 REQ 30%
               </motion.div>
               <div className="absolute right-12 h-full w-px bg-primary" />
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: [0, 1, 0] }}
                 transition={{ repeat: Infinity, duration: 3, delay: 1.5 }}
                 className="text-[10px] font-mono text-primary"
               >
                 LIMIT 12%
               </motion.div>
            </div>

          </div>
          <div className="border border-border p-8 bg-card">
            <CreditCard className="text-verified-green" />
            <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.2em]">03 TRANSACTABLE</h3>
            <p className="mt-4 text-[11px] font-mono text-primary">Take the transaction to verified payment.</p>
            <p className="mt-8 text-sm text-muted-foreground">Every transaction flows through server-side Razorpay verification to ensure orders are completed safely.</p>
            <div className="mt-8 flex gap-1">
              {["QUOTE", "CHCKOUT", "PAY", "DONE"].map((s, i) => (
                <motion.div 
                  key={s}
                  initial={{ opacity: 0.2 }}
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ repeat: Infinity, duration: 4, delay: i * 1 }}
                  className={cn(
                    "flex-1 text-[8px] font-bold text-center py-1 border",
                    i === 3 ? "border-verified-green text-verified-green" : "border-border text-muted-foreground"
                  )}
                >
                  {s}
                </motion.div>
              ))}
            </div>

          </div>
          <div className="mt-8 grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-4 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
             <div>No client-side pricing</div>
             <div>No AI-controlled discounts</div>
             <div>No autonomous payment capture</div>
             <div>No direct database access</div>
          </div>
        </section>


        <section className="py-20 sm:py-32 border-t border-border">
          <h2 className="text-3xl sm:text-4xl font-semibold">Every money action has an authority.</h2>
          <div className="mt-8 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
             {["AI REQUESTS", "MERCHANT POLICY BOUNDS", "SERVER DECIDES", "RAZORPAY VERIFIES"].map((title, i) => (
                <motion.div 
                  key={title} 
                  initial={{ opacity: 0.5, borderColor: "var(--border)" }}
                  whileInView={{ 
                    opacity: 1, 
                    borderColor: i === 2 ? "var(--primary)" : "var(--border)",
                    backgroundColor: i === 2 ? "oklch(from var(--primary) l c h / 0.05)" : "transparent"
                  }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                  className="border p-6"
                >
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">{title}</p>
                    <div className="mt-4 h-[1px] w-full bg-border relative overflow-hidden">
                       {i === 2 && (
                         <motion.div 
                           animate={{ x: ["-100%", "100%"] }}
                           transition={{ repeat: Infinity, duration: 2 }}
                           className="absolute inset-0 bg-primary/40"
                         />
                       )}
                    </div>
                </motion.div>
             ))}
          </div>

        </section>
 
        <section className="py-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12 border-t border-border">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">SERVER AUTHORITY</p>
            <p className="mt-2 text-sm text-muted-foreground">Pricing · Inventory · Policy</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">TENANT ISOLATION</p>
            <p className="mt-2 text-sm text-muted-foreground">Merchant-scoped data</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">AUDITABLE</p>
            <p className="mt-2 text-sm text-muted-foreground">Orders · Payments · Agent traces</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">RAZORPAY</p>
            <p className="mt-2 text-sm text-muted-foreground">Verified payments</p>
          </div>
        </section>


        <section className="py-32 text-center bg-card border border-border">
           <p className="text-[10px] font-bold uppercase text-primary tracking-[0.2em]">BUILD FOR THE AGENTIC WEB</p>
           <h2 className="mt-6 text-5xl font-semibold">Make your store legible to AI.</h2>
           <p className="mt-6 text-muted-foreground max-w-lg mx-auto">Define your commercial limits. Let external agents transact within them.</p>
           <div className="mt-12 flex justify-center gap-4">
              <Button asChild className="h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-none"><Link to="/login">Open Merchant Console</Link></Button>
              <Button asChild variant="outline" className="h-12 border-border text-foreground hover:bg-accent rounded-none"><Link to="/agent-api">Explore Agent API</Link></Button>
           </div>
        </section>

      </main>

      <footer className="border-t border-border py-12 text-center text-muted-foreground text-[11px] uppercase tracking-widest">
        <p>© 2026 Agentic Commerce. AI-native commerce infrastructure.</p>
      </footer>
    </div>
  );
}
