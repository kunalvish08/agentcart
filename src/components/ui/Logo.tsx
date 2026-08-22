import React from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  iconOnly?: boolean;
}

export function Logo({ className, iconOnly = false }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5 group", className)}>
      <div className="relative flex size-8 shrink-0 items-center justify-center">
        {/* Background base */}
        <div className="absolute inset-0 rounded-sm bg-foreground/5 dark:bg-foreground/10 border border-border/50 group-hover:border-primary/50 transition-colors" />
        
        {/* The Symbol: Distinctive geometric mark */}
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg" 
          className="size-5 relative z-10"
        >
          {/* Autonomous AI / Network Nodes */}
          <rect x="4" y="4" width="6" height="6" rx="1" className="fill-muted-foreground group-hover:fill-primary transition-colors" />
          <rect x="14" y="14" width="6" height="6" rx="1" className="fill-muted-foreground group-hover:fill-primary transition-colors" />
          
          {/* Transaction / Secure Authority Path */}
          <path 
            d="M10 7H14V17H10" 
            stroke="currentColor" 
            strokeWidth="1.5" 
            className="text-foreground/20 dark:text-foreground/40" 
          />
          <path 
            d="M10 7L14 7M14 17L10 17" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="square"
            className="text-primary" 
          />
          
          {/* Infrastructure / Trust Center */}
          <circle cx="12" cy="12" r="1.5" fill="currentColor" className="text-foreground" />
        </svg>

        {/* Subtle accent glow */}
        <div className="absolute inset-0 rounded-sm bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {!iconOnly && (
        <div className="flex flex-col leading-none">
          <span className="text-sm font-bold tracking-tight text-foreground">
            Agentic <span className="text-primary">Commerce</span>
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mt-0.5">
            Infrastructure
          </span>
        </div>
      )}
    </div>
  );
}
