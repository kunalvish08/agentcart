import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus } from "lucide-react";

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
    <AppShell
      title="Products"
      subtitle={workspace.data ? `Catalog for ${workspace.data.merchant.name}` : "Catalog"}
      accountLabel={workspace.data?.profile.email ?? undefined}
    >
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {products.data ? `${products.data.length} products` : "Loading catalog…"}
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          New product
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="w-56">Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.isPending ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : null}

            {products.data?.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <p className="font-medium text-foreground">{product.name}</p>
                  <p className="max-w-sm truncate text-xs text-muted-foreground">
                    {product.description}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{product.category ?? "—"}</Badge>
                </TableCell>
                <TableCell className="text-right font-medium">{inr.format(product.price)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-8 w-20"
                      type="number"
                      min={0}
                      value={stockDrafts[product.id] ?? String(product.stock_quantity)}
                      onChange={(e) =>
                        setStockDrafts((prev) => ({ ...prev, [product.id]: e.target.value }))
                      }
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={stockMutation.isPending}
                      onClick={() =>
                        stockMutation.mutate({
                          id: product.id,
                          stock_quantity: Number(
                            stockDrafts[product.id] ?? product.stock_quantity,
                          ),
                        })
                      }
                    >
                      Save
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={product.status === "active"}
                      onCheckedChange={(checked) =>
                        statusMutation.mutate({
                          id: product.id,
                          status: checked ? "active" : "inactive",
                        })
                      }
                    />
                    <span className="text-xs text-muted-foreground">{product.status}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(product)}>
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            {products.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No products yet. Create your first product.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit product" : "New product"}</DialogTitle>
            <DialogDescription>
              Prices and stock are stored in PostgreSQL and scoped to your store.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(form);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
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

            <DialogFooter>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {form.id ? "Save changes" : "Create product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
