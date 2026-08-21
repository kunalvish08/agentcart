import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Handshake,
  IndianRupee,
  Package,
  Percent,
  Store,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCheckoutMetrics } from "@/lib/checkout.functions";
import { getGrowthMetrics, getWorkspace } from "@/lib/merchant.functions";
import { getPaymentMetrics } from "@/lib/payments.functions";


export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function DashboardPage() {
  const fetchWorkspace = useServerFn(getWorkspace);
  const fetchGrowth = useServerFn(getGrowthMetrics);
  const { data, isPending, error } = useQuery({
    queryKey: ["workspace"],
    queryFn: () => fetchWorkspace(),
  });
  const { data: growth } = useQuery({
    queryKey: ["growth-metrics"],
    queryFn: () => fetchGrowth(),
  });
  const fetchCheckout = useServerFn(getCheckoutMetrics);
  const { data: checkout } = useQuery({
    queryKey: ["checkout-metrics"],
    queryFn: () => fetchCheckout(),
    refetchInterval: 15_000,
  });
  const fetchPayments = useServerFn(getPaymentMetrics);
  const { data: payments } = useQuery({
    queryKey: ["payment-metrics"],
    queryFn: () => fetchPayments(),
    refetchInterval: 15_000,
  });


  const manifestUrl =
    typeof window === "undefined"
      ? "/.well-known/agent-manifest"
      : `${window.location.origin}/.well-known/agent-manifest`;


  const metrics = [
    { label: "Total products", value: data ? String(data.stats.totalProducts) : "—", icon: Package },
    {
      label: "Total inventory units",
      value: data ? data.stats.totalInventoryUnits.toLocaleString("en-IN") : "—",
      icon: Boxes,
    },
    {
      label: "Active products",
      value: data ? String(data.stats.activeProducts) : "—",
      icon: CheckCircle2,
    },
    {
      label: "Max discount allowed",
      value: data ? `${data.policy.max_discount_percent}%` : "—",
      icon: Percent,
    },
    {
      label: "Max order value",
      value: data ? inr.format(data.policy.max_order_value) : "—",
      icon: IndianRupee,
    },
    {
      label: "Inventory value",
      value: data ? inr.format(data.stats.inventoryValue) : "—",
      icon: Store,
    },
  ];

  return (
    <AppShell
      title={data?.merchant.name ?? "Merchant dashboard"}
      subtitle={data?.merchant.description ?? "Store overview"}
      accountLabel={data?.profile.email ?? undefined}
    >
      {error ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load your workspace"}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Currency: {data?.merchant.currency ?? "INR"}</Badge>
        <Badge variant={data?.merchant.status === "active" ? "default" : "outline"}>
          Store {data?.merchant.status ?? "—"}
        </Badge>
        {(data?.roles ?? []).map((role) => (
          <Badge key={role} variant="outline">
            Role: {role}
          </Badge>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isPending ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Negotiation authority</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Approval required above"
            value={data ? inr.format(data.policy.approval_required_above) : "—"}
          />
          <Field label="Negotiation" value={data?.policy.allow_negotiation ? "Enabled" : "Disabled"} />
          <Field label="Upsell" value={data?.policy.allow_upsell ? "Enabled" : "Disabled"} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="size-4" /> AI Commerce
          </CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link to="/agent-api">
              View Agent API
              <ExternalLink className="ml-2 size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={data?.merchant.agent_commerce_enabled ? "default" : "outline"}>
              AI Commerce {data?.merchant.agent_commerce_enabled ? "enabled" : "disabled"}
            </Badge>
            <Badge variant={data?.merchant.status === "active" ? "secondary" : "outline"}>
              Public catalog {data?.merchant.status === "active" ? "live" : "offline"}
            </Badge>
            <Badge variant="secondary">Public API operational</Badge>
            <Badge variant="outline">
              Negotiation {data?.policy.allow_negotiation ? "enabled" : "disabled"}
            </Badge>
            <Badge variant="outline">Upsell {data?.policy.allow_upsell ? "enabled" : "disabled"}</Badge>
            <Badge variant={payments?.configured ? "secondary" : "outline"}>
              Razorpay test mode {payments?.configured ? "configured" : "not configured"}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Discovery manifest"
              value={manifestUrl ?? "/.well-known/agent-manifest"}
            />
            <Field
              label="Public API calls (24h)"
              value={data ? `${data.agentApi.requests24h} (${data.agentApi.failures24h} failed)` : "—"}
            />
            <Field
              label="Last agent request"
              value={
                data?.agentApi.lastRequestAt
                  ? new Date(data.agentApi.lastRequestAt).toLocaleString("en-IN")
                  : "No requests yet"
              }
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Public endpoints: <code>/api/public/catalog</code>, <code>/api/public/products/:id</code>,{" "}
            <code>/api/public/search</code>, <code>/api/public/quote</code>. Prices, inventory and
            discounts are always computed server-side against your merchant policy.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Handshake className="size-4" /> Negotiation &amp; growth
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field
              label="Negotiations"
              value={growth ? `${growth.negotiations} (${growth.openNegotiations} open)` : "—"}
            />
            <Field
              label="Discount rounds"
              value={growth ? `${growth.rounds} (${growth.countered} countered)` : "—"}
            />
            <Field
              label="Avg approved discount"
              value={growth ? `${growth.avgApprovedDiscount}%` : "—"}
            />
            <Field label="Offers generated" value={growth ? String(growth.offers) : "—"} />
            <Field
              label="Offer value (final)"
              value={growth ? inr.format(growth.offerValue) : "—"}
            />
            <Field label="List value" value={growth ? inr.format(growth.listValue) : "—"} />
            <Field label="Discount given" value={growth ? inr.format(growth.discountGiven) : "—"} />
            <Field
              label="Recommendations"
              value={
                growth
                  ? `${growth.recommendations} (${growth.acceptedRecommendations} accepted)`
                  : "—"
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Every discount here was decided by the server policy engine against your
            {" "}
            {data ? `${data.policy.max_discount_percent}%` : ""} cap — never by the AI model.
            Payment capture arrives in a later phase.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="size-4" /> Agentic checkout
            {checkout && checkout.pendingApprovals > 0 ? (
              <Badge variant="secondary">{checkout.pendingApprovals} awaiting you</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Orders created" value={checkout ? String(checkout.orders) : "—"} />
            <Field
              label="Pending approvals"
              value={checkout ? String(checkout.pendingApprovals) : "—"}
            />
            <Field
              label="Reviewed today"
              value={
                checkout
                  ? `${checkout.approvedToday} approved · ${checkout.rejectedToday} rejected`
                  : "—"
              }
            />
            <Field
              label="Awaiting payment"
              value={
                checkout
                  ? `${checkout.awaitingPayment} · ${inr.format(checkout.paymentPendingValue)}`
                  : "—"
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field label="Payments pending" value={payments ? String(payments.pending) : "—"} />
            <Field label="Payments verified" value={payments ? String(payments.verified) : "—"} />
            <Field label="Failed payments" value={payments ? String(payments.failed) : "—"} />
            <Field
              label="Completed orders"
              value={
                payments
                  ? `${payments.completedOrders} · ${inr.format(payments.verifiedValue)}`
                  : "—"
              }
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="sm" variant="outline">
              <Link to="/approvals">Open approval queue &amp; payments</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Orders above your{" "}
              {data ? inr.format(data.policy.approval_required_above) : ""} approval threshold wait for
              your decision. The AI agent can request checkout but can never approve one, and an
              order is only COMPLETED after a server-verified Razorpay test-mode payment.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 border-primary/30 bg-primary/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="size-4 text-primary" />
            Judge Mode & Phase 11
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-md border border-border bg-card p-4 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
            {`'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''
                                        
                                            
                                            Judge Mode persistence bug — READ-ONLY AUDIT ONLY

When I leave /judge and return to it, the Judge Mode counters and

demo transaction state appear as 0 / empty, even though I just

completed a real Razorpay test payment and the order reached:

PAYMENT_VERIFIED → ORDER_COMPLETED

DO NOT CHANGE ANY CODE YET.

Audit the actual implementation and determine:

1. Where Judge Mode counters are loaded from.

2. Whether counters are calculated from persisted database records

   or only from current/in-memory demo state.

3. How the selected/latest Judge demo run is identified.

4. Whether \`/judge\` loses its selected run after navigation/remount.

5. Whether React/TanStack Query cache is responsible.

6. Whether the completed order, payment, agent run, steps and tool

   calls still exist in the database after leaving \`/judge\`.

7. Whether the "Reset Judge Demo" action is being called accidentally

   or whether any cleanup happens on page unmount.

8. Whether the current Judge Mode query filters are incorrectly

   restricted to an in-memory session/run.

9. Whether the completed Razorpay order is still retrievable from

   persisted records.

Specifically inspect:

- src/routes/_authenticated/judge.tsx

- src/lib/judge.server.ts

- relevant TanStack Query hooks

- agent_runs

- agent_steps

- tool_calls

- orders

- payments

- webhook_events

Return:

A. DATABASE STATE AFTER NAVIGATION

B. WHY /judge SHOWS ZERO

C. EXACT FILE/FUNCTION CAUSING IT

D. WHETHER DATA WAS ACTUALLY DELETED

E. MINIMUM SAFE FIX

IMPORTANT:

- READ ONLY

- Do not modify database

- Do not reset demo state

- Do not modify Razorpay/payment logic

- Do not modify Phase 09/10 evaluation data

- Do not implement a fix yet`}

- confirmation that Phase 09/10 evaluation history remains

- confirmation that merchant/catalog/policy remain unchanged

8. Add tests covering:

- demo records are removed

- merchant remains

- products remain

- policies remain

- Phase 09 evaluation records remain

- Phase 10 evaluation records remain

- non-demo records cannot be deleted

- unauthorized users cannot invoke reset

9. Run typecheck, build and relevant security tests.

Do not add fake demo data or hardcoded results.

Before implementation, identify exactly how demo records will be

safely distinguished from historical/non-demo records.

Return the proposed scope first, then implement.`}
          </div>
        </CardContent>
      </Card>

    </AppShell>
  );
}


function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
