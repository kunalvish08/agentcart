import { Link, createFileRoute } from "@tanstack/react-router";
import { Database, Lock, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agentic Commerce Platform · Merchant Foundation" },
      {
        name: "description",
        content:
          "AI-native agentic commerce platform foundation: merchant accounts, product catalog, inventory and negotiation policies secured with PostgreSQL row level security.",
      },
      { property: "og:title", content: "Agentic Commerce Platform · Merchant Foundation" },
      {
        property: "og:description",
        content:
          "Phase 01 foundation: authentication, roles, merchants, products, inventory and policy limits enforced at the database layer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const PILLARS = [
  {
    icon: Lock,
    title: "Server-side authority",
    body: "Every write goes through authenticated server functions. No secret ever reaches the browser.",
  },
  {
    icon: ShieldCheck,
    title: "Tenant isolation",
    body: "Row level security scopes merchants, products, policies and product relations to their owner.",
  },
  {
    icon: Database,
    title: "Extensible schema",
    body: "Structured for future agent runs, negotiations, orders, payments, audit logs and evaluations.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="font-semibold">Agentic Commerce</p>
            <p className="text-xs text-sidebar-foreground/60">Phase 02 · agent discovery</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/agent-api">Agent API</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/login">Merchant sign in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-20 pt-10">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sidebar-primary">
          Secure application foundation
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          The merchant control plane for AI-native commerce.
        </h1>
        <p className="mt-5 max-w-2xl text-base text-sidebar-foreground/70">
          Merchants define their catalog, inventory and commercial limits here. External AI buyers
          discover and price that catalog through machine-readable public APIs — never above the limits
          stored in the database.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/login">Open merchant console</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/agent-api">Explore the Agent API</Link>
          </Button>
        </div>


        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border border-sidebar-border p-5">
              <Icon className="size-5 text-sidebar-primary" />
              <p className="mt-3 font-medium">{title}</p>
              <p className="mt-2 text-sm text-sidebar-foreground/60">{body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
