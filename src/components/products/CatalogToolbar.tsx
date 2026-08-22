import { Search, Filter, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CatalogToolbar() {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-3 p-3 border-x border-t border-[var(--border-color)] bg-[var(--bg-surface)] font-mono">
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-muted)]" />
        <Input 
          placeholder="Search products..." 
          className="pl-9 h-9 rounded-none border-[var(--border-color)] bg-[var(--bg-page)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:ring-[var(--accent)]/20 focus-visible:border-[var(--accent)]/50"
        />
      </div>
      
      <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
        <Button variant="outline" size="sm" className="h-9 rounded-none border-[var(--border-color)] bg-[var(--bg-page)] text-[var(--text-secondary)] text-[10px] uppercase tracking-widest font-bold hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-colors">
          <Filter className="mr-2 size-3 text-[var(--text-muted)]" />
          Category
        </Button>
        <Button variant="outline" size="sm" className="h-9 rounded-none border-[var(--border-color)] bg-[var(--bg-page)] text-[var(--text-secondary)] text-[10px] uppercase tracking-widest font-bold hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-colors">
          <Filter className="mr-2 size-3 text-[var(--text-muted)]" />
          Status
        </Button>
        <Button variant="outline" size="sm" className="h-9 rounded-none border-[var(--border-color)] bg-[var(--bg-page)] text-[var(--text-secondary)] text-[10px] uppercase tracking-widest font-bold hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-colors">
          <ArrowUpDown className="mr-2 size-3 text-[var(--text-muted)]" />
          Sort
        </Button>
      </div>
    </div>
  );
}
