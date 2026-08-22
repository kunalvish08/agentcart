import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProductsHeaderProps {
  merchantName: string;
  totalProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  onNewProduct: () => void;
}

export function ProductsHeader({
  merchantName,
  totalProducts,
  activeProducts,
  inactiveProducts,
  onNewProduct,
}: ProductsHeaderProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground uppercase font-mono">Products</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Catalog for {merchantName}
          </p>
        </div>
        <Button 
          onClick={onNewProduct}
          className="bg-[var(--accent)] hover:opacity-90 text-white font-bold uppercase tracking-widest rounded-none h-10 px-6 font-mono border-none"
        >
          <Plus className="mr-2 size-4" />
          New product
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 border border-[var(--border-color)] bg-[var(--bg-surface)] font-mono">
        <div>
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Total Products</p>
          <p className="text-lg font-bold text-[var(--text-primary)]">{totalProducts}</p>
        </div>
        <div className="border-l border-[var(--border-color)] pl-4">
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Active</p>
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-bold text-[var(--success)]">{activeProducts}</p>
            <div className="size-1.5 rounded-full bg-[var(--success)] animate-pulse" />
          </div>
        </div>
        <div className="border-l border-[var(--border-color)] pl-4">
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Inactive</p>
          <p className="text-lg font-bold text-[var(--inactive)]">{inactiveProducts}</p>
        </div>
        <div className="border-l border-[var(--border-color)] pl-4">
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Public Catalog</p>
          <div className="flex items-center gap-2">
            <p className="text-lg font-bold text-[var(--accent)]">ACTIVE</p>
            <div className="px-1.5 py-0.5 bg-[var(--auth-panel-bg)] border border-[var(--auth-panel-border)]/20">
              <span className="text-[8px] text-[var(--accent)] font-bold">DISCOVERABLE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
