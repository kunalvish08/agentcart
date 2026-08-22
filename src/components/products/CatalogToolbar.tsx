import { Search, Filter, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CatalogToolbar() {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-3 p-3 border-x border-t border-border bg-graphite-900/30 font-mono">
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input 
          placeholder="Search products..." 
          className="pl-9 h-9 rounded-none border-border bg-graphite-950 text-xs focus-visible:ring-copper-500/20 focus-visible:border-copper-500/50"
        />
      </div>
      
      <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
        <Button variant="outline" size="sm" className="h-9 rounded-none border-border bg-graphite-950 text-[10px] uppercase tracking-widest font-bold">
          <Filter className="mr-2 size-3 text-muted-foreground" />
          Category
        </Button>
        <Button variant="outline" size="sm" className="h-9 rounded-none border-border bg-graphite-950 text-[10px] uppercase tracking-widest font-bold">
          <Filter className="mr-2 size-3 text-muted-foreground" />
          Status
        </Button>
        <Button variant="outline" size="sm" className="h-9 rounded-none border-border bg-graphite-950 text-[10px] uppercase tracking-widest font-bold">
          <ArrowUpDown className="mr-2 size-3 text-muted-foreground" />
          Sort
        </Button>
      </div>
    </div>
  );
}
