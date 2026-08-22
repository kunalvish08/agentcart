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

function SchematicNode({ title, items, className, delay = 0, isServerAuthority = false }: { title: string, items: string[], className?: string, delay?: number, isServerAuthority?: boolean }) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative rounded-sm border border-border/60 bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-primary/40",
        isServerAuthority && "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/20 shadow-[0_0_30px_-10px_rgba(49,87,255,0.2)]",
        className
      )}
    >
      {isServerAuthority && (
        <div className="absolute -top-px left-4 right-4 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      )}
      <p className={cn(
        "mb-3 text-[10px] font-bold uppercase tracking-[0.2em]",
        isServerAuthority ? "text-primary" : "text-[#8291A8]"
      )}>{title}</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div className={cn(
              "h-[1px] w-2",
              isServerAuthority ? "bg-primary/40" : "bg-border"
            )} />
            <span className={cn(
              "text-[11px] font-medium tracking-tight",
              isServerAuthority ? "text-white" : (className?.includes("!text-[#18A878]") ? "text-[#18A878]" : "text-[#B8C4D6]")
            )}>{item}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function Connector({ vertical = false, delay = 0, active = false }: { vertical?: boolean, delay?: number, active?: boolean }) {
  return (
    <div className={cn("flex items-center justify-center relative", vertical ? "h-12 w-full" : "h-full w-12")}>
      <div className={cn(
        "bg-border/40 relative", 
        vertical ? "w-px h-full" : "h-px w-full"
      )}>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.3 }}
          className={cn(
            "absolute bg-primary/40",
            vertical 
              ? "left-[-1px] w-[3px] h-4 top-0" 
              : "top-[-1px] h-[3px] w-4 left-0"
          )}
          style={{
            animation: `flow-${vertical ? 'v' : 'h'} 3s linear infinite`,
            animationDelay: `${delay}s`
          }}
        />
      </div>
    </div>
  );
}


function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/10">
      {/* 1. TOP NAVIGATION */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 leading-none transition-opacity hover:opacity-90">
              <span className="text-sm font-bold tracking-tight uppercase">Agentic Commerce</span>
              <span className="h-3 w-[1px] bg-border/60 mx-1 hidden sm:block" />
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold hidden sm:block">AI Infrastructure</span>
            </Link>
          </div>
          
          <div className="flex items-center gap-8">
            <Link to="/agent-api" className="text-[11px] font-bold uppercase tracking-widest text-slate-600 transition-all hover:text-primary relative group">
              Agent API
              <span className="absolute -bottom-1 left-0 w-0 h-px bg-primary transition-all group-hover:w-full" />
            </Link>
            <Button asChild variant="link" size="sm" className="h-auto p-0 text-[11px] font-bold uppercase tracking-widest text-foreground hover:no-underline relative group">
              <Link to="/login">
                Merchant Console
                <span className="absolute -bottom-1 left-0 w-0 h-px bg-foreground transition-all group-hover:w-full" />
              </Link>
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
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="mb-8 inline-flex items-center gap-3"
              >
                <div className="h-[1px] w-8 bg-primary/60" />
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#3157FF]">
                  AI COMMERCE INFRASTRUCTURE
                </span>
              </motion.div>
              
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="text-5xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl"
              >
                Let AI buyers <br />shop your store.
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="mt-10 text-lg leading-relaxed text-slate-600 md:text-xl max-w-xl"
              >
                Keep the money under your control. Expose your catalog to external agents while keeping pricing and payment authority on your server.
              </motion.p>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="mt-12 flex flex-col items-center gap-6 sm:flex-row"
              >
                <Button asChild size="lg" className="h-12 w-full px-8 text-[11px] font-bold uppercase tracking-widest shadow-none rounded-none sm:w-auto">
                  <Link to="/login">Open merchant console</Link>
                </Button>
                <Button asChild variant="ghost" size="lg" className="h-12 w-full px-8 text-[11px] font-bold uppercase tracking-widest hover:bg-transparent hover:text-primary transition-colors sm:w-auto">
                  <Link to="/agent-api" className="flex items-center gap-2">
                    Explore Agent API <ArrowRight size={14} />
                  </Link>
                </Button>
              </motion.div>
            </div>

            {/* 3. RIGHT SIDE — CORE PRODUCT VISUAL */}
            <div className="relative order-first lg:order-last">
              <div className="relative rounded border border-border/60 bg-[#0B1220] p-8">
                <div className="flex flex-col gap-2">
                  <SchematicNode 
                    title="MERCHANT" 
                    items={["Catalog", "Policies"]} 
                    delay={0.2}
                  />
                  
                  <Connector vertical delay={0.4} />
                  
                  <SchematicNode 
                    title="AI BUYER" 
                    items={['"Laptop under ₹60k"']} 
                    delay={0.6}
                  />

                  <Connector vertical delay={0.8} />

                  <SchematicNode 
                    title="PUBLIC AGENT API" 
                    items={["/search · /quote", "/negotiate · /checkout"]} 
                    delay={1.0}
                  />

                  <Connector vertical delay={1.2} />

                  <SchematicNode 
                    title="SERVER AUTHORITY" 
                    items={["Price", "Inventory", "Policy"]} 
                    isServerAuthority={true}
                    delay={1.4}
                  />

                  <Connector vertical delay={1.6} />

                  <div className="grid grid-cols-2 gap-2">
                    <SchematicNode 
                      title="RAZORPAY" 
                      items={["Verified payment"]} 
                      delay={1.8}
                      className="bg-[#0B1220]"
                    />
                    <SchematicNode 
                      title="STATUS" 
                      items={["COMPLETED"]} 
                      className="border-[#18A878]/30 bg-[#0B1220] !text-[#18A878]"
                      delay={2.0}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. AUTHORITY MESSAGE */}
        <section className="bg-[#0B1220] py-32 text-white overflow-hidden relative">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
               style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
          
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid lg:grid-cols-2 gap-24 items-center">
              <div>
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="mb-8 inline-flex items-center gap-3"
                >
                  <div className="h-[1px] w-8 bg-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary">
                    AUTHORITY MODEL
                  </span>
                </motion.div>
                
                <h2 className="text-4xl font-semibold tracking-tight md:text-5xl leading-[1.1]">
                  AI decides what to ask. <br />
                  <span className="text-[#B8C4D6]">Your server decides what can happen.</span>
                </h2>
                
                <p className="mt-8 text-lg text-[#B8C4D6] max-w-md leading-relaxed">
                  Every commercial action is evaluated against merchant-defined policies before execution.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-px bg-white/10 border border-white/10 rounded-sm overflow-hidden">
                <div className="bg-[#0B1220] p-10">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8291A8]">AI BUYER</p>
                  <h3 className="mt-6 text-sm font-bold uppercase tracking-widest">Capabilities</h3>
                  <ul className="mt-8 space-y-5">
                    {["Discover products", "Search catalog", "Request quotes", "Negotiate", "Request checkout"].map((item) => (
                      <li key={item} className="flex items-center gap-4 text-[11px] font-medium text-[#B8C4D6] tracking-wide">
                        <div className="h-px w-3 bg-[#8291A8]/20" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-primary/[0.03] p-10">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">SERVER</p>
                  <h3 className="mt-6 text-sm font-bold uppercase tracking-widest">Controls</h3>
                  <ul className="mt-8 space-y-5">
                    {["Price authority", "Inventory validation", "Discount limits", "Order state machine", "Payment verification"].map((item) => (
                      <li key={item} className="flex items-center gap-4 text-[11px] font-bold text-white tracking-wide">
                        <CheckCircle2 size={12} className="text-primary" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. THREE CAPABILITY BLOCKS */}
        <section className="mx-auto max-w-7xl px-6 py-32">
          <div className="grid gap-px bg-border/40 border border-border/40 rounded-sm overflow-hidden md:grid-cols-3">
            <motion.div 
              whileHover={{ backgroundColor: "rgba(0,0,0,0.01)" }}
              className="group bg-card p-12 transition-all"
            >
              <div className="mb-8 text-primary">
                <Search size={24} strokeWidth={1.5} />
              </div>
              <h3 className="text-sm font-bold tracking-[0.2em] uppercase">DISCOVERABLE</h3>
              <p className="mt-4 text-[11px] font-medium text-slate-500 italic tracking-wider">"Make your catalog readable by machines."</p>
              <p className="mt-8 text-[13px] leading-relaxed text-slate-700 tracking-tight">
                External AI buyers can discover products through a public machine-readable API designed for LLM tool-calling.
              </p>
            </motion.div>

            <motion.div 
              whileHover={{ backgroundColor: "rgba(0,0,0,0.01)" }}
              className="group bg-card p-12 transition-all"
            >
              <div className="mb-8 text-primary">
                <Scale size={24} strokeWidth={1.5} />
              </div>
              <h3 className="text-sm font-bold tracking-[0.2em] uppercase">BOUNDED</h3>
              <p className="mt-4 text-[11px] font-medium text-slate-500 italic tracking-wider">"Let agents negotiate without giving them pricing authority."</p>
              <p className="mt-8 text-[13px] leading-relaxed text-slate-700 tracking-tight">
                Merchant policies determine discount limits and commercial decisions. The AI buyer requests, the server enforces.
              </p>
            </motion.div>

            <motion.div 
              whileHover={{ backgroundColor: "rgba(0,0,0,0.01)" }}
              className="group bg-card p-12 transition-all"
            >
              <div className="mb-8 text-primary">
                <CreditCard size={24} strokeWidth={1.5} />
              </div>
              <h3 className="text-sm font-bold tracking-[0.2em] uppercase">TRANSACTABLE</h3>
              <p className="mt-4 text-[11px] font-medium text-slate-500 italic tracking-wider">"Take the transaction all the way to verified payment."</p>
              <p className="mt-8 text-[13px] leading-relaxed text-slate-700 tracking-tight">
                Checkout and payment remain server-authoritative and Razorpay-backed, ensuring secure financial completion.
              </p>
            </motion.div>
          </div>
        </section>

        {/* 6. TECHNICAL TRUST STRIP */}
        <section className="border-t border-border/40 bg-card py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-2 gap-y-12 md:grid-cols-4 md:gap-12">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500">SERVER AUTHORITY</p>
                <div className="mt-4 text-[11px] font-bold uppercase tracking-widest text-slate-900">
                   Price · Inventory · Policy
                </div>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500">TENANT ISOLATION</p>
                <div className="mt-4 text-[11px] font-bold uppercase tracking-widest text-slate-900">
                   Merchant-scoped data
                </div>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500">AUDITABLE</p>
                <div className="mt-4 text-[11px] font-bold uppercase tracking-widest text-slate-900">
                   Orders · Payments · Traces
                </div>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500">RAZORPAY</p>
                <div className="mt-4 text-[11px] font-bold uppercase tracking-widest text-slate-900">
                   Verified payments
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. FINAL CTA */}
        <section className="bg-[#0B1220] py-32 text-white text-center">
          <div className="mx-auto max-w-xl px-6">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">Make your store <br />legible to AI.</h2>
              <p className="mt-8 text-[15px] leading-relaxed text-[#B8C4D6]">
                Start with your catalog. Define your commercial limits. Let external agents transact within them.
              </p>
              <div className="mt-12 flex flex-col items-center justify-center gap-6 sm:flex-row">
                <Button asChild size="lg" className="h-12 w-full px-10 text-[11px] font-bold uppercase tracking-widest bg-white text-[#0B1220] hover:bg-white/90 rounded-none sm:w-auto shadow-none">
                  <Link to="/login">Open merchant console</Link>
                </Button>
                <Button asChild variant="ghost" size="lg" className="h-12 w-full px-10 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-white/5 sm:w-auto">
                  <Link to="/agent-api">Explore Agent API</Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* 8. FOOTER */}
      <footer className="border-t border-border/40 bg-muted/10 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
          <div className="flex flex-col items-center gap-1 sm:items-start">
             <span className="text-sm font-bold tracking-tight">Agentic Commerce</span>
             <span className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">© 2026 AI-Native Infra</span>
          </div>
          
          <div className="flex items-center gap-8">
            <Link to="/agent-api" className="text-xs font-semibold text-slate-600 hover:text-foreground">Agent API</Link>
            <Link to="/login" className="text-xs font-semibold text-slate-600 hover:text-foreground">Merchant Console</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
