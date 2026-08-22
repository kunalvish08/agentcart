import { Link, createFileRoute } from "@tanstack/react-router";
import { 
  ArrowRight, 
  Terminal, 
  ShieldCheck, 
  Search, 
  Scale, 
  CreditCard, 
  Database,
  Lock,
  ArrowDown,
  CheckCircle2,
  XCircle,
  Menu,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agentic Commerce Platform · AI-Native Infrastructure" },
      {
        name: "description",
        content:
          "AI-native agentic commerce platform foundation: machine-readable catalogs and server-authoritative negotiation policies.",
      },
      { property: "og:title", content: "Agentic Commerce Platform · AI-Native Infrastructure" },
      {
        property: "og:description",
        content:
          "Let AI buyers shop your store while keeping authority over price, policy and money on your server.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function SchematicNode({ title, items, className, delay = 0 }: { title: string, items: string[], className?: string, delay?: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className={cn("rounded border border-border bg-card p-3 shadow-sm", className)}
    >
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-primary/40" />
            <span className="text-[11px] font-medium text-foreground/80">{item}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function Connector({ vertical = false, delay = 0 }: { vertical?: boolean, delay?: number }) {
  return (
    <div className={cn("flex items-center justify-center", vertical ? "h-8 w-full" : "h-full w-8")}>
      <motion.div 
        initial={vertical ? { height: 0 } : { width: 0 }}
        animate={vertical ? { height: "100%" } : { width: "100%" }}
        transition={{ delay, duration: 0.5 }}
        className={cn("bg-border relative", vertical ? "w-[1px]" : "h-[1px]")}
      >
        <motion.div 
          animate={vertical ? { y: [0, 32], opacity: [0, 1, 0] } : { x: [0, 32], opacity: [0, 1, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear", delay: delay + 0.5 }}
          className={cn("absolute bg-primary/40", vertical ? "left-[-1px] h-2 w-[3px]" : "top-[-1px] h-[3px] w-2")}
        />
      </motion.div>
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/10">
      {/* 1. TOP NAVIGATION */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex flex-col items-start leading-none transition-opacity hover:opacity-90">
              <span className="text-sm font-bold tracking-tight">Agentic Commerce</span>
              <span className="mt-1 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">AI-native commerce infrastructure</span>
            </Link>
          </div>
          
          <div className="flex items-center gap-6">
            <Link to="/agent-api" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hidden sm:block">
              Agent API
            </Link>
            <Button asChild size="sm" className="h-9 px-4 text-xs font-semibold tracking-tight shadow-sm">
              <Link to="/login">Merchant sign in</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main>
        {/* 2. HERO */}
        <section className="mx-auto max-w-7xl px-6 py-16 md:py-24">
          <div className="grid gap-16 lg:grid-cols-[1fr_450px] lg:items-center">
            {/* LEFT SIDE */}
            <div className="max-w-2xl">
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 inline-flex items-center rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary"
              >
                AI-NATIVE COMMERCE INFRASTRUCTURE
              </motion.div>
              
              <motion.h1 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-5xl lg:text-6xl"
              >
                Let AI buyers shop your store. <br />
                <span className="text-muted-foreground">Keep the money under your control.</span>
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-8 text-lg leading-relaxed text-muted-foreground/90 md:text-xl"
              >
                Expose your catalog to external AI agents, let them discover products and negotiate within your rules, and keep pricing, checkout and payment authority on the server.
              </motion.p>
              
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
              >
                <Button asChild size="lg" className="h-12 w-full px-8 text-sm font-semibold shadow-md sm:w-auto">
                  <Link to="/login">Open merchant console</Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-12 w-full border-border bg-transparent px-8 text-sm font-semibold sm:w-auto">
                  <Link to="/agent-api">Explore Agent API</Link>
                </Button>
              </motion.div>
            </div>

            {/* 3. RIGHT SIDE — CORE PRODUCT VISUAL */}
            <div className="relative order-first lg:order-last">
              <div className="relative rounded-xl border border-border bg-muted/30 p-6 md:p-8">
                <div className="flex flex-col gap-4">
                  <SchematicNode 
                    title="MERCHANT" 
                    items={["TechNova Store", "Products · Inventory", "Discount Policies"]} 
                    className="border-primary/20 bg-primary/[0.02]"
                    delay={0.4}
                  />
                  
                  <Connector vertical delay={0.6} />
                  
                  <SchematicNode 
                    title="PUBLIC AGENT API" 
                    items={["/search · /quote", "/negotiate · /checkout"]} 
                    className="bg-card"
                    delay={0.8}
                  />

                  <div className="flex items-center">
                     <div className="flex-1">
                        <Connector vertical delay={1.0} />
                        <SchematicNode 
                          title="AI BUYER" 
                          items={['"Laptop under ₹60k"']} 
                          className="border-dashed"
                          delay={1.2}
                        />
                     </div>
                     <div className="flex-none px-4 text-muted-foreground/30">
                        <ArrowRight size={20} />
                     </div>
                     <div className="flex-1">
                        <Connector vertical delay={1.4} />
                        <SchematicNode 
                          title="SERVER AUTHORITY" 
                          items={["Price · Inventory", "Verified Order"]} 
                          className="border-primary bg-primary/[0.03] ring-1 ring-primary/20"
                          delay={1.6}
                        />
                     </div>
                  </div>

                  <Connector vertical delay={1.8} />

                  <div className="grid grid-cols-2 gap-4">
                    <SchematicNode 
                      title="RAZORPAY" 
                      items={["Verified payment"]} 
                      delay={2.0}
                    />
                    <SchematicNode 
                      title="STATUS" 
                      items={["COMPLETED ORDER"]} 
                      className="border-green-500/20 bg-green-500/[0.02]"
                      delay={2.2}
                    />
                  </div>
                </div>

                {/* Status indicators */}
                <div className="absolute top-4 right-4 flex gap-2">
                  <div className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[9px] font-bold text-green-600">
                    <div className="h-1 w-1 rounded-full bg-green-600 animate-pulse" />
                    LIVE
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">
                    ENFORCED
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. AUTHORITY MESSAGE */}
        <section className="border-y border-border/60 bg-muted/20 py-24">
          <div className="mx-auto max-w-5xl px-6 text-center">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              AI decides what to ask. <br className="sm:hidden" />
              <span className="text-muted-foreground">Your server decides what can happen.</span>
            </h2>
            
            <div className="mt-16 grid gap-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm md:grid-cols-2">
              <div className="p-8 text-left md:border-r md:border-border">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">AI BUYER</p>
                <h3 className="mt-4 text-lg font-semibold">Can:</h3>
                <ul className="mt-6 space-y-4">
                  {["discover products", "search catalog", "request quote", "negotiate", "request checkout"].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
                      <ChevronRight size={14} className="text-muted-foreground/40" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-primary/[0.01] p-8 text-left">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">SERVER</p>
                <h3 className="mt-4 text-lg font-semibold">Controls:</h3>
                <ul className="mt-6 space-y-4">
                  {["price authority", "inventory validation", "discount limits", "order state machine", "payment verification"].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm font-semibold text-foreground">
                      <CheckCircle2 size={16} className="text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 5. THREE CAPABILITY BLOCKS */}
        <section className="mx-auto max-w-7xl px-6 py-24 md:py-32">
          <div className="grid gap-12 md:grid-cols-3">
            <motion.div 
              whileHover={{ y: -5 }}
              className="group rounded-xl border border-border bg-card p-8 shadow-sm transition-all"
            >
              <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                <Search size={20} />
              </div>
              <h3 className="text-base font-bold tracking-tight">DISCOVERABLE</h3>
              <p className="mt-2 text-sm font-medium text-muted-foreground italic tracking-tight">"Make your catalog readable by machines."</p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground/80">
                External AI buyers can discover products through a public machine-readable API designed for LLM tool-calling.
              </p>
            </motion.div>

            <motion.div 
              whileHover={{ y: -5 }}
              className="group rounded-xl border border-border bg-card p-8 shadow-sm transition-all"
            >
              <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                <Scale size={20} />
              </div>
              <h3 className="text-base font-bold tracking-tight">BOUNDED</h3>
              <p className="mt-2 text-sm font-medium text-muted-foreground italic tracking-tight">"Let agents negotiate without giving them pricing authority."</p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground/80">
                Merchant policies determine discount limits and commercial decisions. The AI buyer requests, the server enforces.
              </p>
            </motion.div>

            <motion.div 
              whileHover={{ y: -5 }}
              className="group rounded-xl border border-border bg-card p-8 shadow-sm transition-all"
            >
              <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                <CreditCard size={20} />
              </div>
              <h3 className="text-base font-bold tracking-tight">TRANSACTABLE</h3>
              <p className="mt-2 text-sm font-medium text-muted-foreground italic tracking-tight">"Take the transaction all the way to verified payment."</p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground/80">
                Checkout and payment remain server-authoritative and Razorpay-backed, ensuring secure financial completion.
              </p>
            </motion.div>
          </div>
        </section>

        {/* 6. TECHNICAL TRUST STRIP */}
        <section className="border-t border-border/60 bg-background py-16">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-2 gap-y-12 md:grid-cols-4 md:gap-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SERVER AUTHORITY</p>
                <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
                   Pricing · Inventory · Policy
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">TENANT ISOLATION</p>
                <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
                   Merchant-scoped data
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">AUDITABLE</p>
                <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
                   Orders · Payments · Traces
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">RAZORPAY</p>
                <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
                   Test-mode verified payments
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. FINAL CTA */}
        <section className="mx-auto max-w-7xl px-6 py-24 md:py-32">
          <div className="rounded-2xl border border-border bg-muted/30 p-12 text-center md:p-20">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Make your store legible to AI.</h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
              Start with your catalog. Define your limits. Let external agents transact within them.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg" className="h-12 w-full px-10 text-sm font-semibold sm:w-auto">
                <Link to="/login">Open merchant console</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 w-full border-border bg-transparent px-10 text-sm font-semibold sm:w-auto">
                <Link to="/agent-api">Explore Agent API</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* 8. FOOTER */}
      <footer className="border-t border-border/40 bg-muted/10 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
          <div className="flex flex-col items-center gap-1 sm:items-start">
             <span className="text-sm font-bold tracking-tight">Agentic Commerce</span>
             <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">© 2026 AI-Native Infra</span>
          </div>
          
          <div className="flex items-center gap-8">
            <Link to="/agent-api" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Agent API</Link>
            <Link to="/login" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Merchant Console</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
