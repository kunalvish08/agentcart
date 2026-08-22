import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, MoreHorizontal, ShieldCheck, Database, Info } from "lucide-react";
import { cn } from "@/lib/utils";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  createProduct,
  getWorkspace,
  listProducts,
  setProductStatus,
  updateProduct,
  updateStock,
} from "@/lib/merchant.functions";
import type { ProductRow } from "@/lib/merchant-schemas";
import { ProductsHeader } from "@/components/products/ProductsHeader";
import { CatalogToolbar } from "@/components/products/CatalogToolbar";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

type FormState = {
  id: string | null;
  name: string;
  description: string;
  category: string;
  price: string;
  stock_quantity: string;
  status: "active" | "inactive";
};

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  description: "",
  category: "",
  price: "",
  stock_quantity: "0",
  status: "active",
};

function ProductsPage() {
  const queryClient = useQueryClient();
  const fetchProducts = useServerFn(listProducts);
  const fetchWorkspace = useServerFn(getWorkspace);
  const create = useServerFn(createProduct);
  const update = useServerFn(updateProduct);
  const stock = useServerFn(updateStock);
  const status = useServerFn(setProductStatus);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});

  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => fetchWorkspace() });
  const products = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["workspace"] });
  }

  const saveMutation = useMutation({
    mutationFn: async (state: FormState) => {
      const payload = {
        name: state.name,
        description: state.description,
        category: state.category,
        price: Number(state.price),
        stock_quantity: Number(state.stock_quantity),
        status: state.status,
      };
      if (state.id) {
        return update({ data: { ...payload, id: state.id } });
      }
      return create({ data: payload });
    },
    onSuccess: () => {
      toast.success(form.id ? "Product updated" : "Product created");
      setOpen(false);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  const stockMutation = useMutation({
    mutationFn: (input: { id: string; stock_quantity: number }) => stock({ data: input }),
    onSuccess: () => {
      toast.success("Stock updated");
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update stock"),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: "active" | "inactive" }) => status({ data: input }),
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update status"),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(product: ProductRow) {
    setForm({
      id: product.id,
      name: product.name,
      description: product.description ?? "",
      category: product.category ?? "",
      price: String(product.price),
      stock_quantity: String(product.stock_quantity),
      status: product.status,
    });
    setOpen(true);
  }

  return (
    <AppShell title="Products" accountLabel={workspace.data?.profile.email ?? undefined}>
      <div className="max-w-7xl mx-auto space-y-6">
        <ProductsHeader
          merchantName={workspace.data?.merchant.name ?? "Merchant"}
          totalProducts={products.data?.length ?? 0}
          activeProducts={products.data?.filter(p => p.status === "active").length ?? 0}
          inactiveProducts={products.data?.filter(p => p.status === "inactive").length ?? 0}
          onNewProduct={openCreate}
        />

        <div className="border border-border bg-graphite-950 overflow-hidden">
          <CatalogToolbar />

          <div className="bg-graphite-900/20 px-4 py-2 border-b border-border flex items-center gap-2">
            <ShieldCheck className="size-4 text-copper-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-copper-500">SERVER-AUTHORITATIVE</span>
            <span className="text-[10px] text-muted-foreground">Prices and inventory controlled by merchant server.</span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-widest">Product</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest">Category</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-right">Price</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest w-40">Stock</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest">Status</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest">AI Commerce</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-right">Updated</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.isPending ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Skeleton className="h-12 w-full" />
                    </TableCell>
                  </TableRow>
                ) : null}

                {products.data?.map((product) => (
                  <TableRow key={product.id} className="border-border hover:bg-graphite-900/40 transition-colors">
                    <TableCell>
                      <p className="font-bold text-foreground text-sm font-mono">{product.name}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{product.description}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-none bg-graphite-900 border-border text-[10px]">{product.category ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">{inr.format(product.price)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-8 w-16 bg-graphite-950 border-border text-xs text-center font-mono"
                          type="number"
                          value={stockDrafts[product.id] ?? String(product.stock_quantity)}
                          onChange={(e) => setStockDrafts((prev) => ({ ...prev, [product.id]: e.target.value }))}
                        />
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 text-[10px] hover:text-copper-500"
                          onClick={() => stockMutation.mutate({ id: product.id, stock_quantity: Number(stockDrafts[product.id] ?? product.stock_quantity) })}
                        >
                          SAVE
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("rounded-none text-[10px] px-2", product.status === "active" ? "bg-verified-500/10 text-verified-500 border-verified-500/20" : "bg-muted text-muted-foreground border-border")}>
                        {product.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className="rounded-none bg-graphite-900 border-border text-[10px] text-copper-500">PUBLIC</Badge>
                    </TableCell>
                    <TableCell className="text-right text-[10px] text-muted-foreground font-mono">
                      {new Date(product.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-none border-border bg-graphite-950">
                          <DropdownMenuItem onClick={() => openEdit(product)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => statusMutation.mutate({ id: product.id, status: product.status === "active" ? "inactive" : "active" })}>
                            Toggle Status
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl rounded-none border-border bg-graphite-950 p-0 overflow-hidden font-mono">
          <DialogHeader className="p-6 border-b border-border bg-graphite-900/50">
            <div className="flex items-center gap-2 mb-1 text-copper-500">
              <Database className="size-4" />
              <span className="text-[10px] font-bold tracking-widest uppercase">Infrastructure Node</span>
            </div>
            <DialogTitle className="text-xl font-bold uppercase tracking-tight text-foreground">
              {form.id ? "Edit Product" : "New Product"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground uppercase tracking-widest">
              Commercial authority record for TechNova Store
            </DialogDescription>
          </DialogHeader>

          <form
            className="p-6 space-y-8"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-6">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-copper-500/80 pb-2 border-b border-border/50">Product Information</h3>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Name</Label>
                    <Input
                      required
                      className="rounded-none border-border bg-graphite-900 focus-visible:ring-copper-500/20 h-10 text-sm"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Description</Label>
                    <Textarea
                      className="rounded-none border-border bg-graphite-900 focus-visible:ring-copper-500/20 min-h-[100px] text-sm"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Category</Label>
                    <Input
                      className="rounded-none border-border bg-graphite-900 focus-visible:ring-copper-500/20 h-10 text-sm"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-copper-500/80 pb-2 border-b border-border/50">Pricing</h3>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Price (INR)</Label>
                      <Input
                        type="number"
                        min={0}
                        required
                        className="rounded-none border-border bg-graphite-900 focus-visible:ring-copper-500/20 h-10 text-sm font-mono"
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-copper-500/80 pb-2 border-b border-border/50">Inventory</h3>
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Stock Quantity</Label>
                      <Input
                        type="number"
                        min={0}
                        required
                        className="rounded-none border-border bg-graphite-900 focus-visible:ring-copper-500/20 h-10 text-sm font-mono"
                        value={form.stock_quantity}
                        onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-copper-500/80 pb-2 border-b border-border/50">AI Commerce</h3>
                  <div className="p-4 border border-border bg-graphite-900 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Public Catalog</span>
                      <Switch
                        checked={form.status === "active"}
                        onCheckedChange={(checked) =>
                          setForm({ ...form, status: checked ? "active" : "inactive" })
                        }
                      />
                    </div>
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <div className="flex items-center gap-2 text-verified-500">
                        <ShieldCheck className="size-3" />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Discovery</span>
                      </div>
                      <div className="flex items-center gap-2 text-verified-500">
                        <ShieldCheck className="size-3" />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Quote</span>
                      </div>
                      <div className="flex items-center gap-2 text-verified-500">
                        <ShieldCheck className="size-3" />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Negotiation</span>
                      </div>
                      <div className="flex items-center gap-2 text-verified-500">
                        <ShieldCheck className="size-3" />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Checkout</span>
                      </div>
                    </div>
                    <p className="text-[9px] leading-relaxed text-muted-foreground italic">
                      AI agents may discover this product through the public commerce API. Commercial authority remains server-side.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-copper-500/80 pb-2 border-b border-border/50">Technical Meta</h3>
                  <div className="space-y-2 text-[10px] font-mono text-muted-foreground">
                    <div className="flex justify-between">
                      <span className="uppercase">Record ID:</span>
                      <span className="text-foreground truncate ml-4">{form.id?.slice(0, 8) ?? "NEW_NODE"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="uppercase">Authority:</span>
                      <span className="text-foreground uppercase">Merchant Server</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="uppercase">Validation:</span>
                      <span className="text-verified-500 uppercase">Passed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-6 border-t border-border">
              <Button 
                type="submit" 
                disabled={saveMutation.isPending} 
                className="w-full sm:w-auto bg-copper-500 hover:bg-copper-600 text-black font-bold uppercase tracking-widest rounded-none h-10 px-8"
              >
                {saveMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {form.id ? "Commit Changes" : "Create Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
