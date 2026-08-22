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
          className="bg-copper-500 hover:bg-copper-600 text-black font-bold uppercase tracking-widest rounded-none h-10 px-6 font-mono"
        >
          <Plus className="mr-2 size-4" />
          New product
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 border border-border bg-graphite-900/50 font-mono">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Total Products</p>
          <p className="text-lg font-bold text-foreground">{totalProducts}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Active</p>
          <p className="text-lg font-bold text-verified-500">{activeProducts}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Inactive</p>
          <p className="text-lg font-bold text-muted-foreground">{inactiveProducts}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Public Catalog</p>
          <p className="text-lg font-bold text-verified-500">ACTIVE</p>
        </div>
      </div>
    </div>
  );
}
