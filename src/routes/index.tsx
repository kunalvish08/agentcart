import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Search, Scale, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

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
        active ? (copper ? "border-copper bg-slate shadow-[0_0_20px_rgba(213,155,98,0.1)]" : "border-ice/20 bg-slate") : "border-slate bg-graphite",
      )}
    >
      {active && copper && (
        <motion.div 
          animate={{ opacity: [0.2, 0.4, 0.2] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute inset-0 bg-copper/5"
        />
      )}
      <p className={cn("text-[10px] font-bold uppercase tracking-[0.2em]", active ? "text-white" : "text-steel")}>{title}</p>
      {subtitle && <p className={cn("mt-1 text-[11px] font-mono", copper ? "text-copper" : "text-ice")}>{subtitle}</p>}
    </motion.div>
  );
}

function Signal() {
  return (
    <div className="relative h-8 flex justify-center">
      <motion.div 
        animate={{ y: [0, 32], opacity: [0, 1, 0] }}
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        className="w-px h-8 bg-copper"
      />
    </div>
  );
}


function Landing() {
  return (
    <div className="min-h-screen bg-obsidian text-white selection:bg-copper/20 font-sans">
      <nav className="sticky top-0 z-50 border-b border-slate bg-obsidian/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-white">Agentic Commerce</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-steel hidden sm:block">AI INFRASTRUCTURE</span>
          </div>
          <div className="flex items-center gap-8 text-[11px] font-bold uppercase tracking-widest text-steel">
            <Link to="/agent-api" className="hover:text-white transition-colors">Agent API</Link>
            <Link to="/login" className="hover:text-white transition-colors">Merchant Console</Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-20">
        <section className="grid lg:grid-cols-2 gap-20 items-center">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-copper">AI COMMERCE INFRASTRUCTURE</span>
            <h1 className="mt-6 text-6xl font-semibold leading-[1.05] tracking-tight text-white">
              Let AI buyers shop your store. <br />
              <span className="text-steel">Keep the money under your control.</span>
            </h1>
            <p className="mt-10 text-lg text-ice/70 leading-relaxed max-w-xl">
              Expose your catalog to external AI agents while keeping pricing, policy, checkout and payment authority on your server.
            </p>
            <div className="mt-12 flex items-center gap-4">
              <Button asChild className="h-12 bg-copper hover:bg-copper/90 text-obsidian font-bold rounded-none">
                <Link to="/login">Open Merchant Console</Link>
              </Button>
              <Button asChild variant="outline" className="h-12 border-slate bg-transparent text-white hover:bg-slate rounded-none">
                <Link to="/agent-api">Explore Agent API</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-1 p-8 border border-slate bg-graphite rounded-sm relative overflow-hidden">
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

        <section className="py-32 grid lg:grid-cols-2 gap-24 items-center">
          <div>
            <h2 className="text-4xl font-semibold tracking-tight leading-[1.1]">
              AI decides what to ask. <br />
              <span className="text-steel">Your server decides what can happen.</span>
            </h2>
            <div className="mt-12 flex items-center gap-16 border-t border-slate pt-12">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-steel">AI BUYER</p>
                <ul className="mt-6 space-y-3 text-sm text-ice/80">
                  <li>Discover</li>
                  <li>Search</li>
                  <li>Quote</li>
                  <li>Negotiate</li>
                  <li>Checkout</li>
                </ul>
              </div>
              <div className="text-copper font-mono text-sm">REQUEST ≠ AUTHORITY</div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-copper">SERVER AUTHORITY</p>
                <ul className="mt-6 space-y-3 text-sm text-white">
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

        <section className="py-32 grid md:grid-cols-3 gap-8">
          <div className="border border-slate p-8">
            <Search className="text-copper" />
            <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.2em]">01 DISCOVERABLE</h3>
            <p className="mt-4 text-[11px] font-mono text-ice">Make your catalog readable by machines.</p>
            <p className="mt-8 text-sm text-steel">External AI buyers can discover products through a public API designed for LLM tool-calling.</p>
          </div>
          <div className="border border-slate p-8">
            <Scale className="text-copper" />
            <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.2em]">02 BOUNDED</h3>
            <p className="mt-4 text-[11px] font-mono text-ice">Let agents negotiate without giving them pricing authority.</p>
            <p className="mt-8 text-sm text-steel">Merchant policies determine discount limits. The AI buyer requests, the server enforces.</p>
            <div className="mt-8 h-12 flex items-center justify-between px-4 border border-slate bg-obsidian overflow-hidden relative">
               <motion.div 
                 animate={{ x: [0, 150] }}
                 transition={{ repeat: Infinity, duration: 3, ease: "easeIn" }}
                 className="text-[10px] font-mono text-ice"
               >
                 REQ 30%
               </motion.div>
               <div className="absolute right-12 h-full w-px bg-copper" />
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: [0, 1, 0] }}
                 transition={{ repeat: Infinity, duration: 3, delay: 1.5 }}
                 className="text-[10px] font-mono text-copper"
               >
                 LIMIT 12%
               </motion.div>
            </div>

          </div>
          <div className="border border-slate p-8">
            <CreditCard className="text-verified-green" />
            <h3 className="mt-6 text-sm font-bold uppercase tracking-[0.2em]">03 TRANSACTABLE</h3>
            <p className="mt-4 text-[11px] font-mono text-ice">Take the transaction to verified payment.</p>
            <p className="mt-8 text-sm text-steel">Every transaction flows through server-side Razorpay verification to ensure orders are completed safely.</p>
          </div>
        </section>

        <section className="py-32 border-t border-slate">
          <h2 className="text-4xl font-semibold">Every money action has an authority.</h2>
          <div className="mt-16 grid md:grid-cols-4 gap-4">
             {["AI REQUESTS", "MERCHANT POLICY BOUNDS", "SERVER DECIDES", "RAZORPAY VERIFIES"].map((title, i) => (
                <div key={title} className={cn("border p-6", i === 2 ? "border-copper" : "border-slate")}>
                    <p className="text-[10px] font-bold uppercase text-steel">{title}</p>
                </div>
             ))}
          </div>
        </section>
 
        <section className="py-20 grid grid-cols-2 md:grid-cols-4 gap-12 border-t border-slate">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-copper">SERVER AUTHORITY</p>
            <p className="mt-2 text-sm text-steel">Pricing · Inventory · Policy</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-copper">TENANT ISOLATION</p>
            <p className="mt-2 text-sm text-steel">Merchant-scoped data</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-copper">AUDITABLE</p>
            <p className="mt-2 text-sm text-steel">Orders · Payments · Agent traces</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-copper">RAZORPAY</p>
            <p className="mt-2 text-sm text-steel">Verified payments</p>
          </div>
        </section>


        <section className="py-32 text-center bg-graphite border border-slate">
           <p className="text-[10px] font-bold uppercase text-copper tracking-[0.2em]">BUILD FOR THE AGENTIC WEB</p>
           <h2 className="mt-6 text-5xl font-semibold">Make your store legible to AI.</h2>
           <p className="mt-6 text-steel max-w-lg mx-auto">Define your commercial limits. Let external agents transact within them.</p>
           <div className="mt-12 flex justify-center gap-4">
              <Button asChild className="h-12 bg-copper hover:bg-copper/90 text-obsidian font-bold rounded-none"><Link to="/login">Open Merchant Console</Link></Button>
              <Button asChild variant="outline" className="h-12 border-slate text-white hover:bg-slate rounded-none"><Link to="/agent-api">Explore Agent API</Link></Button>
           </div>
        </section>

      </main>

      <footer className="border-t border-slate py-12 text-center text-steel text-[11px] uppercase tracking-widest">
        <p>© 2026 Agentic Commerce. AI-native commerce infrastructure.</p>
      </footer>
    </div>
  );
}
