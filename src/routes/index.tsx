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
      initial={{ opacity: 0, scale: 0.98 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "relative rounded-sm border border-border/60 bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-primary/40",
        isServerAuthority && "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/20 shadow-[0_0_30px_-10px_rgba(49,87,255,0.2)]",
        className
      )}
    >
      {isServerAuthority && (
        <motion.div 
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ repeat: Infinity, duration: 3 }}
          className="absolute -top-px left-4 right-4 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" 
        />
      )}
      <p className={cn(
        "mb-3 text-[10px] font-bold uppercase tracking-[0.2em]",
        isServerAuthority ? "text-primary" : (className?.includes("!text-[#36C5D8]") ? "text-[#36C5D8]" : "text-[#8291A8]")
      )}>{title}</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <motion.div 
            key={i} 
            initial={{ opacity: 0, x: -5 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: delay + 0.2 + (i * 0.1), duration: 0.4 }}
            className="flex items-center gap-2.5"
          >
            <div className={cn(
              "h-[1px] w-2",
              isServerAuthority ? "bg-primary/40" : "bg-border"
            )} />
            <span className={cn(
              "text-[11px] font-medium tracking-tight",
              isServerAuthority ? "text-white" : (className?.includes("!text-[#18A878]") ? "text-[#18A878]" : (className?.includes("!text-[#36C5D8]") ? "text-[#36C5D8]" : "text-[#B8C4D6]"))
            )}>{item}</span>
          </motion.div>
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
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0B1220]/80 backdrop-blur-md">
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 leading-none transition-opacity hover:opacity-90">
              <span className="text-sm font-bold tracking-tight uppercase text-white">Agentic Commerce</span>
              <span className="h-3 w-[1px] bg-white/10 mx-1 hidden sm:block" />
              <span className="text-[9px] text-[#8291A8] uppercase tracking-widest font-bold hidden sm:block">AI Infrastructure</span>
            </Link>
          </div>
          
          <div className="flex items-center gap-8">
            <Link 
              to="/agent-api" 
              className="text-[11px] font-bold uppercase tracking-widest text-[#B8C4D6] transition-all hover:text-white relative group"
            >
              Agent API
              <motion.span className="absolute -bottom-1 left-0 w-0 h-px bg-white transition-all group-hover:w-full" />
            </Link>
            <Button asChild variant="link" size="sm" className="h-auto p-0 text-[11px] font-bold uppercase tracking-widest text-white hover:no-underline relative group">
              <Link to="/login">
                Merchant Console
                <motion.span className="absolute -bottom-1 left-0 w-0 h-px bg-white transition-all group-hover:w-full" />
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
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="text-5xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl"
              >
                Let AI buyers <br />shop your store.
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="mt-10 text-lg leading-relaxed text-slate-600 md:text-xl max-w-xl"
              >
                Expose your catalog to external AI agents, let them discover products and negotiate within your rules — while pricing, checkout and payment remain server-authoritative.
              </motion.p>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="mt-12 flex flex-col items-center gap-6 sm:flex-row"
              >
                <Button asChild size="lg" className="h-12 w-full px-8 text-[11px] font-bold uppercase tracking-widest shadow-none rounded-none sm:w-auto transition-transform hover:translate-y-[-2px]">
                  <Link to="/login">Open merchant console</Link>
                </Button>
                <Button asChild variant="ghost" size="lg" className="h-12 w-full px-8 text-[11px] font-bold uppercase tracking-widest hover:bg-transparent hover:text-primary transition-all hover:translate-x-1 sm:w-auto">
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
                    delay={0.5}
                  />
                  
                  <Connector vertical delay={1.1} />
                  
                  <SchematicNode 
                    title="AI BUYER" 
                    items={['"Laptop under ₹60k"']} 
                    delay={1.6}
                    className="!text-[#36C5D8]"
                  />
 
                  <Connector vertical delay={2.2} />
 
                  <SchematicNode 
                    title="PUBLIC AGENT API" 
                    items={["/search · /quote", "/negotiate · /checkout"]} 
                    delay={2.7}
                  />
 
                  <Connector vertical delay={3.3} />
 
                  <SchematicNode 
                    title="SERVER AUTHORITY" 
                    items={["Price", "Inventory", "Policy"]} 
                    isServerAuthority={true}
                    delay={3.8}
                  />
 
                  <Connector vertical delay={4.4} />
 
                  <div className="grid grid-cols-2 gap-2">
                    <SchematicNode 
                      title="RAZORPAY" 
                      items={["Verified payment"]} 
                      delay={4.9}
                      className="bg-[#0B1220]"
                    />
                    <SchematicNode 
                      title="STATUS" 
                      items={["COMPLETED"]} 
                      className="border-[#18A878]/30 bg-[#0B1220] !text-[#18A878]"
                      delay={5.4}
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
                  <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#3157FF]">
                    AUTHORITY MODEL
                  </span>
                </motion.div>
                
                <motion.h2 
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1, duration: 0.6 }}
                  className="text-4xl font-semibold tracking-tight md:text-5xl leading-[1.1]"
                >
                  AI decides what to ask. <br />
                  <span className="text-[#B8C4D6]">Your server decides what can happen.</span>
                </motion.h2>
                
                <motion.p 
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  className="mt-8 text-lg text-[#B8C4D6] max-w-md leading-relaxed"
                >
                  Every commercial action is evaluated against merchant-defined policies before execution.
                </motion.p>
              </div>

              <div className="grid md:grid-cols-2 gap-px bg-white/10 border border-white/10 rounded-sm overflow-hidden">
                <div className="bg-[#0B1220] p-10">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8291A8]">AI BUYER</p>
                  <h3 className="mt-6 text-sm font-bold uppercase tracking-widest">Capabilities</h3>
                  <ul className="mt-8 space-y-5">
                    {["Discover products", "Search catalog", "Request quotes", "Negotiate", "Request checkout"].map((item, i) => (
                      <motion.li 
                        key={item} 
                        initial={{ opacity: 0, x: -5 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 + (i * 0.1), duration: 0.4 }}
                        className="flex items-center gap-4 text-[11px] font-medium text-[#B8C4D6] tracking-wide"
                      >
                        <div className="h-px w-3 bg-[#8291A8]/20" />
                        {item}
                      </motion.li>
                    ))}
                  </ul>
                </div>
                <div className="bg-primary/[0.03] p-10 relative overflow-hidden">
                  <motion.div 
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.8, duration: 1, ease: "easeInOut" }}
                    className="absolute left-0 top-0 bottom-0 w-[1px] bg-primary/20 origin-top"
                  />
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#36C5D8]">SERVER</p>
                  <h3 className="mt-6 text-sm font-bold uppercase tracking-widest">Controls</h3>
                  <ul className="mt-8 space-y-5">
                    {["Price authority", "Inventory validation", "Discount limits", "Order state machine", "Payment verification"].map((item, i) => (
                      <motion.li 
                        key={item} 
                        initial={{ opacity: 0, x: -5 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.9 + (i * 0.1), duration: 0.4 }}
                        className="flex items-center gap-4 text-[11px] font-bold text-white tracking-wide"
                      >
                        <CheckCircle2 size={12} className="text-primary" />
                        {item}
                      </motion.li>
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
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1, duration: 0.6 }}
              whileHover={{ backgroundColor: "rgba(0,0,0,0.01)" }}
              className="group bg-white p-12 transition-all border-none"
            >
              <motion.div 
                whileHover={{ rotate: 5, scale: 1.1 }}
                className="mb-8 text-primary w-fit"
              >
                <Search size={24} strokeWidth={1.5} />
              </motion.div>
              <h3 className="text-sm font-bold tracking-[0.2em] uppercase text-[#3157FF]">DISCOVERABLE</h3>
              <p className="mt-4 text-[11px] font-medium text-slate-500 italic tracking-wider">"Make your catalog readable by machines."</p>
              <p className="mt-8 text-[13px] leading-relaxed text-slate-700 tracking-tight">
                External AI buyers can discover products through a public machine-readable API designed for LLM tool-calling.
              </p>
            </motion.div>
 
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.6 }}
              whileHover={{ backgroundColor: "rgba(0,0,0,0.01)" }}
              className="group bg-white p-12 transition-all border-none relative overflow-hidden"
            >
              <div className="mb-8 text-primary">
                <Scale size={24} strokeWidth={1.5} />
              </div>
              <h3 className="text-sm font-bold tracking-[0.2em] uppercase text-[#3157FF]">BOUNDED</h3>
              <p className="mt-4 text-[11px] font-medium text-slate-500 italic tracking-wider">"Let agents negotiate without giving them pricing authority."</p>
              <p className="mt-8 text-[13px] leading-relaxed text-slate-700 tracking-tight">
                Merchant policies determine discount limits and commercial decisions. The AI buyer requests, the server enforces.
              </p>
              {/* Subtle animation representing Policy Limit */}
              <motion.div 
                animate={{ x: [-20, 20, -20] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary/5 w-1/2 mx-auto"
              />
            </motion.div>
 
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.6 }}
              whileHover={{ backgroundColor: "rgba(0,0,0,0.01)" }}
              className="group bg-white p-12 transition-all border-none"
            >
              <motion.div 
                animate={{ y: [0, -3, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                className="mb-8 text-primary w-fit"
              >
                <CreditCard size={24} strokeWidth={1.5} />
              </motion.div>
              <h3 className="text-sm font-bold tracking-[0.2em] uppercase text-[#3157FF]">TRANSACTABLE</h3>
              <p className="mt-4 text-[11px] font-medium text-slate-500 italic tracking-wider">"Take the transaction all the way to verified payment."</p>
              <p className="mt-8 text-[13px] leading-relaxed text-slate-700 tracking-tight">
                Checkout and payment remain server-authoritative and Razorpay-backed, ensuring secure financial completion.
              </p>
            </motion.div>
          </div>
        </section>

        {/* 6. TECHNICAL TRUST STRIP */}
        <section className="border-t border-border/40 bg-white py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-2 gap-y-12 md:grid-cols-4 md:gap-12">
              {[
                { label: "SERVER AUTHORITY", content: "Price · Inventory · Policy" },
                { label: "TENANT ISOLATION", content: "Merchant-scoped data" },
                { label: "AUDITABLE", content: "Orders · Payments · Traces" },
                { label: "RAZORPAY", content: "Verified payments" }
              ].map((item, i) => (
                <motion.div 
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                >
                  <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500">{item.label}</p>
                  <div className="mt-4 text-[11px] font-bold uppercase tracking-widest text-slate-900">
                    {item.content}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* 7. FINAL CTA */}
        <section className="bg-[#0B1220] py-32 text-white text-center">
          <div className="mx-auto max-w-xl px-6">
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-4xl font-semibold tracking-tight md:text-5xl text-white">Make your store <br />legible to AI.</h2>
              <p className="mt-8 text-[15px] leading-relaxed text-[#B8C4D6]">
                Start with your catalog. Define your commercial limits. Let external agents transact within them.
              </p>
              <div className="mt-12 flex flex-col items-center justify-center gap-6 sm:flex-row">
                <Button asChild size="lg" className="h-12 w-full px-10 text-[11px] font-bold uppercase tracking-widest bg-white text-[#0B1220] hover:bg-white/90 transition-transform hover:translate-y-[-2px] rounded-none sm:w-auto shadow-none">
                  <Link to="/login">Open merchant console</Link>
                </Button>
                <Button asChild variant="ghost" size="lg" className="h-12 w-full px-10 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-white/5 transition-all hover:translate-x-1 sm:w-auto">
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
