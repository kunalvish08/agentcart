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
  User,
} from "lucide-react";

import { type ReactNode, useEffect, useRef } from "react";
import { useTheme } from "@/routes/__root";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/Logo";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/buyer", label: "AI Buyer", icon: Bot },
  { to: "/buyer-lab", label: "Buyer Lab", icon: Network },
  { to: "/approvals", label: "Approvals", icon: ClipboardCheck },
  { to: "/products", label: "Products", icon: Package },
  { to: "/policies", label: "Policies", icon: ShieldCheck },
  { to: "/lab", label: "Evaluation", icon: FlaskConical },
  { to: "/judge", label: "Judge", icon: Gavel },
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
  const navRef = useRef<HTMLElement>(null);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  // Scroll active item into view on mobile
  useEffect(() => {
    const activeItem = navRef.current?.querySelector('[aria-current="page"]');
    if (activeItem) {
      activeItem.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans md:flex-row">
      {/* DESKTOP SIDEBAR (>= 768px) */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-border bg-card px-4 py-6 md:flex">
        <div>
          <div className="px-2">
            <Logo />
          </div>

          <nav className="mt-8 space-y-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{
                  className: "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-bold bg-accent text-primary",
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
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            hii</p>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* MOBILE HEADER (< 768px) */}
        <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-md md:hidden">
          <Link to="/" className="flex items-center gap-2">
            <Logo iconOnly className="size-7" />
            <span className="text-xs font-bold tracking-tight">Agentic Commerce</span>
          </Link>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleTheme}
              className="flex size-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
            >
              {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>
            <Button variant="ghost" size="icon" onClick={handleSignOut} className="size-8">
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        {/* MOBILE HORIZONTAL NAVIGATION (< 768px) */}
        <nav 
          ref={navRef}
          className="sticky top-14 z-40 flex w-full gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2 no-scrollbar md:hidden"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex min-w-0 flex-shrink-0 items-center gap-2 rounded-sm px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors active:bg-accent min-h-[44px]"
              activeProps={{ 
                className: "flex min-w-0 flex-shrink-0 items-center gap-2 rounded-sm px-3 py-2 text-[10px] font-bold uppercase tracking-widest bg-accent text-primary" 
              }}
            >
              <Icon className="size-3.5 flex-shrink-0" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        {/* DESKTOP HEADER (>= 768px) */}
        <header className="hidden h-16 items-center justify-between gap-4 border-b border-border bg-card/80 px-6 backdrop-blur-md md:flex">
          <div className="flex items-center gap-3 overflow-hidden">
            <h2 className="truncate text-xs font-bold uppercase tracking-widest text-foreground">{title}</h2>
            {subtitle && <p className="hidden truncate text-[9px] font-medium text-muted-foreground lg:block">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={toggleTheme}
              className="flex size-9 items-center justify-center rounded-sm border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </button>
            <div className="h-4 w-px bg-border" />
            {accountLabel && (
              <div className="flex items-center gap-2">
                <User className="size-3.5 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{accountLabel}</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleSignOut} className="h-9 rounded-sm px-3 text-[9px] font-bold uppercase tracking-widest border-border hover:bg-accent">
              <LogOut className="mr-2 size-3.5" />
              Sign out
            </Button>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-7xl">
            {children}
          </div>
        </main>
      </div>
      
      {/* Scrollbar hiding style */}
      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      ` }} />
    </div>
  );
}