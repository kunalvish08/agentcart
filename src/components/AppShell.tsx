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
    <div className="flex min-h-screen bg-background font-sans">
      {/* Desktop Sidebar (>= 768px) */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-border bg-card px-4 py-6 md:flex">
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
        {/* Header - Shared between Desktop and Mobile layout */}
        <header className="sticky top-0 z-50 flex h-16 items-center justify-between gap-4 border-b border-border bg-card/80 px-4 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-3 overflow-hidden">
            {/* Logo/Brand (Always visible) */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0">
              <span className="flex size-7 items-center justify-center rounded-sm bg-primary text-primary-foreground md:hidden">
                <Sparkles className="size-3.5" />
              </span>
              <div className="leading-tight">
                <h1 className="text-xs font-bold tracking-tight text-foreground md:text-sm">Agentic Commerce</h1>
                <p className="hidden text-[9px] font-bold uppercase tracking-widest text-muted-foreground md:block">Infrastructure</p>
              </div>
            </Link>

            <div className="hidden h-4 w-px bg-border md:block" />
            
            <div className="flex flex-col overflow-hidden">
              <h2 className="truncate text-[11px] font-bold uppercase tracking-widest text-foreground md:text-xs">{title}</h2>
              {subtitle && <p className="hidden truncate text-[9px] font-medium text-muted-foreground md:block">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={toggleTheme}
              className="flex size-9 items-center justify-center rounded-sm border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>
            <div className="h-4 w-px bg-border" />
            {accountLabel && (
              <span className="hidden text-[9px] font-bold uppercase tracking-widest text-muted-foreground lg:inline-block">{accountLabel}</span>
            )}
            <Button variant="outline" size="sm" onClick={handleSignOut} className="h-9 rounded-sm px-2 text-[9px] font-bold uppercase tracking-widest border-border hover:bg-accent md:px-3 flex-shrink-0">
              <LogOut className="mr-1.5 size-3 md:mr-2 md:size-3.5" />
              <span className="hidden xs:inline">Sign out</span>
              <span className="xs:hidden">Out</span>
            </Button>
          </div>
        </header>

        {/* Mobile Persistent Horizontal Navigation (< 768px) */}
        <nav className="sticky top-16 z-40 flex w-full gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2 no-scrollbar md:hidden no-scrollbar">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex min-w-0 flex-shrink-0 items-center gap-2 rounded-sm px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors active:bg-accent"
              activeProps={{ 
                className: "flex min-w-0 flex-shrink-0 items-center gap-2 rounded-sm px-3 py-2 text-[10px] font-bold uppercase tracking-widest bg-accent text-primary shadow-[0_2px_0_0_var(--primary)]" 
              }}
            >
              <Icon className="size-3.5 flex-shrink-0" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
