import { Search, Filter, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CatalogToolbar() {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-3 p-3 border-x border-t border-[#252D38] bg-[#11161D] font-mono">
      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#707B8C]" />
        <Input 
          placeholder="Search products..." 
          className="pl-9 h-9 rounded-none border-[#252D38] bg-[#0B0F14] text-xs text-[#F5F7FA] placeholder:text-[#707B8C] focus-visible:ring-[#5B8DEF]/20 focus-visible:border-[#5B8DEF]/50"
        />
      </div>
      
      <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
        <Button variant="outline" size="sm" className="h-9 rounded-none border-[#252D38] bg-[#161C24] text-[#A0A9B8] text-[10px] uppercase tracking-widest font-bold hover:bg-[#252D38] hover:text-[#F5F7FA] transition-colors">
          <Filter className="mr-2 size-3 text-[#707B8C]" />
          Category
        </Button>
        <Button variant="outline" size="sm" className="h-9 rounded-none border-[#252D38] bg-[#161C24] text-[#A0A9B8] text-[10px] uppercase tracking-widest font-bold hover:bg-[#252D38] hover:text-[#F5F7FA] transition-colors">
          <Filter className="mr-2 size-3 text-[#707B8C]" />
          Status
        </Button>
        <Button variant="outline" size="sm" className="h-9 rounded-none border-[#252D38] bg-[#161C24] text-[#A0A9B8] text-[10px] uppercase tracking-widest font-bold hover:bg-[#252D38] hover:text-[#F5F7FA] transition-colors">
          <ArrowUpDown className="mr-2 size-3 text-[#707B8C]" />
          Sort
        </Button>
      </div>
    </div>
  );
}
