import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  ClipboardCheck,
  Gavel,
  LayoutDashboard,
  LogOut,
  Network,
  FlaskConical,
  Package,
  ShieldCheck,
  Sparkles,
  Sun,
  Moon,
} from "lucide-react";

import { type ReactNode } from "react";
import { useTheme } from "@/routes/__root";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/buyer", label: "AI Buyer", icon: Bot },
  { to: "/buyer-lab", label: "External AI Buyer", icon: Network },
  { to: "/approvals", label: "Approvals", icon: ClipboardCheck },
  { to: "/products", label: "Products", icon: Package },
  { to: "/policies", label: "Policies", icon: ShieldCheck },
  { to: "/lab", label: "Evaluation Lab", icon: FlaskConical },
  { to: "/judge", label: "Judge Mode", icon: Gavel },
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
  const { theme, toggleTheme } = useTheme();

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
            <span className="flex size-8 items-center justify-center rounded-sm bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-tight">Agentic Commerce</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Infrastructure</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{
                  className:
                    "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-bold bg-accent text-primary",
                }}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="space-y-4 px-2">
          <div className="h-px bg-border/50" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">v1.0.6 · RAZORPAY TEST</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card px-6 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">{title}</h1>
            {subtitle ? <p className="text-xs font-medium text-muted-foreground">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleTheme}
              className="flex size-8 items-center justify-center rounded-sm hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>
            <div className="h-4 w-px bg-border" />
            {accountLabel ? (
              <span className="hidden text-[11px] font-bold uppercase tracking-widest text-muted-foreground sm:inline">{accountLabel}</span>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleSignOut} className="h-8 rounded-sm text-[10px] font-bold uppercase tracking-widest border-border hover:bg-accent">
              <LogOut className="mr-2 size-3.5" />
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
