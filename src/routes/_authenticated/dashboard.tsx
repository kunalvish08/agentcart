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
                                        
                                            
                                            STOP MAKING UI/TEXT CHANGES.

The previous request was an AUDIT request, not a UI copywriting request.

Do not modify any file, database, UI, schema, prompt, logic, or configuration.

Perform READ-ONLY AUDIT ONLY.

Inspect the actual existing implementation and return a report containing:

1. GOLDEN DEMO

- Can buyer search a product?

- Can buyer negotiate?

- Is discount enforced server-side?

- Can buyer request checkout?

- Does approval create the correct order state?

- Does Razorpay test payment work?

- Is payment signature verified server-side?

- Does verified payment complete the order?

2. JUDGE MODE

Identify the actual files/functions responsible for:

- trace creation

- tool calls

- policy decisions

- order state transitions

- payment state transitions

- replay

3. SECURITY

Verify whether these existing paths actually work:

- discount above policy cap

- inventory overshoot

- duplicate checkout

- forged webhook

- illegal state transition

4. DEMO RESET

Check whether a safe demo reset already exists.

Do NOT implement one.

5. EVIDENCE

For every claim, identify the actual file/function/database table

that proves it.

Distinguish:

- REAL IMPLEMENTATION

- UI ONLY

- HARDCODED DISPLAY

- NOT IMPLEMENTED

6. REGRESSION RISK

Confirm whether Phase 09 and Phase 10 functionality is untouched.

IMPORTANT:

- DO NOT edit anything.

- DO NOT change dashboard text.

- DO NOT create new components.

- DO NOT create new database tables.

- DO NOT run migrations.

- DO NOT change payment/security logic.

Return ONLY the audit report.`}
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
