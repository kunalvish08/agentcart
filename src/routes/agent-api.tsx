import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Play, Terminal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/agent-api")({
  head: () => ({
    meta: [
      { title: "Agent Commerce API — TechNova Store" },
      {
        name: "description",
        content:
          "Machine-readable agent-commerce APIs: discovery manifest, catalog, product details, deterministic search and server-authorised quotes.",
      },
      { property: "og:title", content: "Agent Commerce API — TechNova Store" },
      {
        property: "og:description",
        content:
          "Public, AI-agent-ready commerce APIs with server-side pricing authority and merchant policy enforcement.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentApiPage,
});

type Endpoint = {
  id: string;
  method: "GET" | "POST";
  path: string;
  purpose: string;
  auth: string;
  request: string;
  response: string;
  errors: { code: string; status: number; when: string }[];
};

const ENDPOINTS: Endpoint[] = [
  {
    id: "discovery",
    method: "GET",
    path: "/.well-known/agent-manifest",
    purpose:
      "Agent discovery. Describes the merchant, currency, supported capabilities and the endpoints an external AI buyer should call. Checkout and payments are advertised as false in Phase 02.",
    auth: "None (public, read-only)",
    request: `curl https://your-domain/.well-known/agent-manifest`,
    response: `{
  "schema_version": "1.0",
  "name": "TechNova Store",
  "currency": "INR",
  "capabilities": {
    "catalog": true,
    "product_search": true,
    "quotes": true,
    "negotiation": true,
    "upsell": true,
    "checkout": false,
    "payments": false
  },
  "endpoints": {
    "catalog": "/api/public/catalog",
    "products": "/api/public/products/:id",
    "search": "/api/public/search",
    "quote": "/api/public/quote"
  }
}`,
    errors: [
      { code: "merchant_not_found", status: 404, when: "Unknown or non-public merchant slug" },
      { code: "rate_limited", status: 429, when: "Too many requests from one client" },
    ],
  },
  {
    id: "catalog",
    method: "GET",
    path: "/api/public/catalog",
    purpose:
      "Machine-readable catalog of active products for an active merchant. Supports bounded pagination (limit ≤ 50) and a safe merchant slug. Defaults to the TechNova demo merchant.",
    auth: "None (public, read-only)",
    request: `curl "https://your-domain/api/public/catalog?limit=5&offset=0&merchant=technova-store"`,
    response: `{
  "merchant": { "name": "TechNova Store", "slug": "technova-store", "currency": "INR" },
  "pagination": { "total": 5, "limit": 5, "offset": 0, "returned": 5 },
  "products": [
    {
      "product_id": "uuid",
      "name": "DeveloperBook Pro 15",
      "category": "Laptops",
      "price": 55000,
      "currency": "INR",
      "availability": "available",
      "stock_status": "in_stock",
      "attributes": { },
      "related_products": [ { "relation_type": "cross_sell", "product_id": "uuid" } ]
    }
  ]
}`,
    errors: [
      { code: "invalid_query", status: 400, when: "limit/offset/merchant fail validation" },
      { code: "merchant_not_found", status: 404, when: "Merchant inactive or unknown" },
    ],
  },
  {
    id: "product",
    method: "GET",
    path: "/api/public/products/:id",
    purpose:
      "Public details for a single active product, including eligible cross-sell/upsell products (upsell only when merchant policy allows it).",
    auth: "None (public, read-only)",
    request: `curl "https://your-domain/api/public/products/<product-uuid>"`,
    response: `{
  "product": {
    "product_id": "uuid",
    "name": "DeveloperBook Pro 15",
    "price": 55000,
    "currency": "INR",
    "availability": "available",
    "stock_status": "in_stock"
  },
  "related_products": [ { "relation_type": "cross_sell", "name": "..." } ],
  "quote_endpoint": "/api/public/quote"
}`,
    errors: [
      { code: "invalid_product_id", status: 400, when: "id is not a UUID" },
      { code: "product_not_found", status: 404, when: "Missing, inactive, or other merchant's product" },
    ],
  },
  {
    id: "search",
    method: "GET",
    path: "/api/public/search",
    purpose:
      "Deterministic catalog search and filtering — no LLM involved. Parameters: q (≤ 200 chars), category, min_price, max_price, in_stock, limit (≤ 20). Unknown parameters are ignored.",
    auth: "None (public, read-only)",
    request: `curl "https://your-domain/api/public/search?q=coding+laptop&max_price=60000&limit=5"`,
    response: `{
  "query": { "q": "coding laptop", "max_price": 60000, "limit": 5 },
  "count": 1,
  "results": [
    {
      "rank": 1,
      "relevance_score": 9,
      "product_id": "uuid",
      "name": "DeveloperBook Pro 15",
      "category": "Laptops",
      "price": 55000,
      "currency": "INR",
      "availability": "available"
    }
  ]
}`,
    errors: [
      { code: "invalid_query", status: 400, when: "q too long, non-positive max_price, limit > 20" },
      { code: "rate_limited", status: 429, when: "Too many requests from one client" },
    ],
  },
  {
    id: "quote",
    method: "POST",
    path: "/api/public/quote",
    purpose:
      "Requests a server-authorised quote. The server validates the product, inventory and quantity, loads merchant policy from the database, caps the discount, and computes every amount in integer paise. Client-supplied prices or totals are ignored.",
    auth: "None (public). Pricing authority is always the server.",
    request: `curl -X POST https://your-domain/api/public/quote \\
  -H "content-type: application/json" \\
  -d '{ "product_id": "<uuid>", "quantity": 1, "requested_discount_percent": 50 }'`,
    response: `{
  "quote_id": "uuid",
  "product_id": "uuid",
  "quantity": 1,
  "base_amount": 55000,
  "requested_discount_percent": 50,
  "allowed_discount_percent": 12,
  "discount_amount": 6600,
  "final_amount": 48400,
  "currency": "INR",
  "policy_applied": true,
  "policy_reason": "Requested discount 50% exceeds the merchant limit of 12%; capped at 12%.",
  "expires_at": "2026-01-01T00:15:00.000Z"
}`,
    errors: [
      { code: "invalid_request", status: 400, when: "Bad UUID, quantity < 1 or > 1000, discount outside 0–100" },
      { code: "product_not_found", status: 404, when: "Unknown product for this merchant" },
      { code: "product_inactive", status: 409, when: "Product is not active" },
      { code: "insufficient_inventory", status: 409, when: "Requested quantity exceeds stock" },
      { code: "order_value_exceeded", status: 409, when: "Total above the merchant max order value" },
    ],
  },
];

function AgentApiPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back home
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            Agent Commerce API
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Machine-readable HTTP APIs designed for consumption by external AI buying agents — no
            merchant frontend required. All endpoints return JSON. Monetary amounts, inventory checks
            and policy enforcement are deterministic server-side code; no language model participates
            in pricing or authorisation.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="secondary">Phase 02</Badge>
            <Badge variant="outline">Public · unauthenticated reads</Badge>
            <Badge variant="outline">Server-side pricing authority</Badge>
            <Badge variant="outline">Checkout &amp; payments: not yet available</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <TryApi />

        <div className="mt-10 space-y-6">
          {ENDPOINTS.map((endpoint) => (
            <Card key={endpoint.id} id={endpoint.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={endpoint.method === "GET" ? "secondary" : "default"}>
                    {endpoint.method}
                  </Badge>
                  <CardTitle className="font-mono text-base break-all">{endpoint.path}</CardTitle>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{endpoint.purpose}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Authentication:</span> {endpoint.auth}
                </p>
                <CodeBlock label="Request" code={endpoint.request} />
                <CodeBlock label="Response" code={endpoint.response} />
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Errors
                  </p>
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-left">Code</th>
                          <th className="px-3 py-2 text-left">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {endpoint.errors.map((err) => (
                          <tr key={err.code} className="border-t border-border">
                            <td className="px-3 py-2 font-mono">{err.status}</td>
                            <td className="px-3 py-2 font-mono">{err.code}</td>
                            <td className="px-3 py-2 text-muted-foreground">{err.when}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const PRESETS = [
  { label: "Discovery manifest", method: "GET" as const, path: "/.well-known/agent-manifest", body: "" },
  { label: "Catalog", method: "GET" as const, path: "/api/public/catalog?limit=5", body: "" },
  {
    label: "Search",
    method: "GET" as const,
    path: "/api/public/search?q=laptop&max_price=60000&limit=5",
    body: "",
  },
  {
    label: "Quote (50% requested)",
    method: "POST" as const,
    path: "/api/public/quote",
    body: `{\n  "product_id": "<paste-product-uuid>",\n  "quantity": 1,\n  "requested_discount_percent": 50\n}`,
  },
];

function TryApi() {
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [path, setPath] = useState("/.well-known/agent-manifest");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<number | null>(null);
  const [output, setOutput] = useState("");
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setOutput("");
    setStatus(null);
    try {
      const response = await fetch(path, {
        method,
        ...(method === "POST"
          ? { headers: { "content-type": "application/json" }, body: body || "{}" }
          : {}),
      });
      setStatus(response.status);
      const text = await response.text();
      try {
        setOutput(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setOutput(text);
      }
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Terminal className="size-4" /> Try the API
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Call the live endpoints from this page. Tip: run the catalog request first to copy a real
          product id into the quote body.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              size="sm"
              variant="outline"
              onClick={() => {
                setMethod(preset.method);
                setPath(preset.path);
                setBody(preset.body);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
          <div>
            <Label htmlFor="try-method">Method</Label>
            <select
              id="try-method"
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={method}
              onChange={(event) => setMethod(event.target.value as "GET" | "POST")}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>
          <div>
            <Label htmlFor="try-path">Path</Label>
            <Input
              id="try-path"
              className="mt-1 font-mono"
              value={path}
              onChange={(event) => setPath(event.target.value)}
            />
          </div>
        </div>

        {method === "POST" ? (
          <div>
            <Label htmlFor="try-body">JSON body</Label>
            <textarea
              id="try-body"
              rows={6}
              className="mt-1 w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Button onClick={run} disabled={pending}>
            <Play className="mr-2 size-4" />
            {pending ? "Sending…" : "Send request"}
          </Button>
          {status !== null ? (
            <Badge variant={status < 400 ? "secondary" : "destructive"}>HTTP {status}</Badge>
          ) : null}
        </div>

        {output ? (
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
            <code>{output}</code>
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
