import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getWorkspace, updatePolicy } from "@/lib/merchant.functions";

export const Route = createFileRoute("/_authenticated/policies")({
  component: PoliciesPage,
});

type PolicyForm = {
  max_discount_percent: string;
  max_order_value: string;
  approval_required_above: string;
  allow_negotiation: boolean;
  allow_upsell: boolean;
};

function PoliciesPage() {
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(getWorkspace);
  const savePolicy = useServerFn(updatePolicy);

  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => fetchWorkspace() });
  const [form, setForm] = useState<PolicyForm | null>(null);

  useEffect(() => {
    if (workspace.data && form === null) {
      setForm({
        max_discount_percent: String(workspace.data.policy.max_discount_percent),
        max_order_value: String(workspace.data.policy.max_order_value),
        approval_required_above: String(workspace.data.policy.approval_required_above),
        allow_negotiation: workspace.data.policy.allow_negotiation,
        allow_upsell: workspace.data.policy.allow_upsell,
      });
    }
  }, [workspace.data, form]);

  const mutation = useMutation({
    mutationFn: (state: PolicyForm) =>
      savePolicy({
        data: {
          max_discount_percent: Number(state.max_discount_percent),
          max_order_value: Number(state.max_order_value),
          approval_required_above: Number(state.approval_required_above),
          allow_negotiation: state.allow_negotiation,
          allow_upsell: state.allow_upsell,
        },
      }),
    onSuccess: () => {
      toast.success("Policies saved");
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save policies"),
  });

  return (
    <AppShell
      title="Merchant policies"
      subtitle="Commercial limits that will later bound automated negotiation server-side"
      accountLabel={workspace.data?.profile.email ?? undefined}
    >
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Negotiation and order limits</CardTitle>
          <CardDescription>
            Stored per merchant in PostgreSQL and protected by row level security.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {form === null ? (
            <p className="text-sm text-muted-foreground">Loading policies…</p>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate(form);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="discount">Max discount (%)</Label>
                  <Input
                    id="discount"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.max_discount_percent}
                    onChange={(e) => setForm({ ...form, max_discount_percent: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxOrder">Max order value (INR)</Label>
                  <Input
                    id="maxOrder"
                    type="number"
                    min={0}
                    step="1"
                    value={form.max_order_value}
                    onChange={(e) => setForm({ ...form, max_order_value: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="approval">Approval required above (INR)</Label>
                  <Input
                    id="approval"
                    type="number"
                    min={0}
                    step="1"
                    value={form.approval_required_above}
                    onChange={(e) => setForm({ ...form, approval_required_above: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-md border border-border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Allow negotiation</p>
                    <p className="text-xs text-muted-foreground">
                      Permits future agent flows to negotiate within the discount limit.
                    </p>
                  </div>
                  <Switch
                    checked={form.allow_negotiation}
                    onCheckedChange={(checked) => setForm({ ...form, allow_negotiation: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Allow upsell</p>
                    <p className="text-xs text-muted-foreground">
                      Permits cross-sell and upsell suggestions from product relations.
                    </p>
                  </div>
                  <Switch
                    checked={form.allow_upsell}
                    onCheckedChange={(checked) => setForm({ ...form, allow_upsell: checked })}
                  />
                </div>
              </div>

              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Save policies
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
