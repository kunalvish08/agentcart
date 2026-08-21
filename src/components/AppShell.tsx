import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Package,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/buyer", label: "AI Buyer", icon: Bot },
  { to: "/approvals", label: "Approvals", icon: ClipboardCheck },
  { to: "/products", label: "Products", icon: Package },
  { to: "/policies", label: "Policies", icon: ShieldCheck },
] as const;

export function AppShell({
  title,
  subtitle,
  accountLabel,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  accountLabel?: string | undefined;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col justify-between bg-sidebar px-4 py-6 text-sidebar-foreground md:flex">
        <div>
          <div className="flex items-center gap-2 px-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Agentic Commerce</p>
              <p className="text-xs text-sidebar-foreground/60">Merchant Console</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeProps={{
                  className:
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium bg-sidebar-accent text-sidebar-accent-foreground",
                }}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="space-y-3 px-2">
          <p className="text-xs text-sidebar-foreground/60">Phase 06 · Razorpay test payments</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-3">
            {accountLabel ? (
              <span className="hidden text-sm text-muted-foreground sm:inline">{accountLabel}</span>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 size-4" />
              Sign out
            </Button>
          </div>
        </header>

        <nav className="flex gap-1 border-b border-border bg-card px-4 py-2 md:hidden">
          {NAV.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground"
              activeProps={{ className: "rounded-md px-3 py-1.5 text-sm bg-secondary text-secondary-foreground" }}
            >
              {label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
