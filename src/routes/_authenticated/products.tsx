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
        <DialogContent className="rounded-sm border-border bg-card sm:max-w-[500px]">
          <DialogHeader className="border-b border-border pb-4 -mx-6 px-6 bg-muted/30">
            <DialogTitle className="text-base font-bold uppercase tracking-tight">{form.id ? "Edit Product" : "New Product"}</DialogTitle>
            <DialogDescription className="text-xs">
              Prices and inventory are stored in PostgreSQL and scoped to your merchant identity.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-6 pt-6"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Product Name</Label>
              <Input
                id="name"
                required
                className="rounded-sm border-border bg-background focus-visible:ring-primary/20 h-10 text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Price (INR)</Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock">Stock</Label>
                <Input
                  id="stock"
                  type="number"
                  min={0}
                  required
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.status === "active"}
                onCheckedChange={(checked) =>
                  setForm({ ...form, status: checked ? "active" : "inactive" })
                }
              />
              <span className="text-sm text-muted-foreground">Active in catalog</span>
            </div>

            <DialogFooter className="pt-4 border-t border-border -mx-6 px-6">
              <Button type="submit" disabled={saveMutation.isPending} className="rounded-sm font-bold uppercase tracking-widest px-8">
                {saveMutation.isPending ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
                {form.id ? "Save Changes" : "Create Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
