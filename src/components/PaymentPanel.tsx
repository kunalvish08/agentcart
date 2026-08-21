// Phase 06 — buyer payment panel (Razorpay Checkout, TEST MODE).
//
// The browser receives only the publishable key id, the Razorpay order id and the
// amount the server computed. It never decides the amount, and a "success" callback
// from Razorpay is treated as a claim: the order is shown as paid only after the
// server verifies the signature and reads the payment back from Razorpay.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CheckoutState } from "@/lib/checkout-state";
import { CHECKOUT_STATE_LABELS } from "@/lib/checkout-state";
import { PAYMENT_STATE_LABELS, type PaymentState } from "@/lib/payment-state";
import {
  getOrderPayment,
  initializeOrderPayment,
  verifyOrderPayment,
} from "@/lib/payments.functions";

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayHandlerResponse = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if ((window as unknown as Record<string, unknown>)["Razorpay"]) return resolve(true);
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const money = (amount: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    amount,
  );

const PAYMENT_TIMELINE: PaymentState[] = ["PENDING", "AUTHORIZED", "CAPTURED", "VERIFIED"];

export function PaymentPanel({
  orderId,
  orderStatus,
  amount,
  currency,
  buyerName,
}: {
  orderId: string;
  orderStatus: CheckoutState;
  amount: number;
  currency: string;
  buyerName?: string | null;
}) {
  const queryClient = useQueryClient();
  const initPayment = useServerFn(initializeOrderPayment);
  const verifyPayment = useServerFn(verifyOrderPayment);
  const fetchPayment = useServerFn(getOrderPayment);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const payment = useQuery({
    queryKey: ["order-payment", orderId],
    queryFn: () => fetchPayment({ data: { order_id: orderId } }),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && status !== "VERIFIED" && status !== "FAILED" ? 5000 : false;
    },
  });

  const state = payment.data?.status ?? null;
  const verified = state === "VERIFIED";
  const completed = orderStatus === "COMPLETED";

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["order-payment", orderId] }),
      queryClient.invalidateQueries({ queryKey: ["order-status", orderId] }),
      queryClient.invalidateQueries({ queryKey: ["payment-metrics"] }),
      queryClient.invalidateQueries({ queryKey: ["checkout-metrics"] }),
    ]);
  };

  async function handlePay() {
    setBusy(true);
    setMessage(null);
    try {
      const init = await initPayment({ data: { order_id: orderId } });
      if (!init.ok) {
        setMessage({ tone: "error", text: `${init.error.message} (${init.error.code})` });
        return;
      }
      await refresh();

      const ready = await loadRazorpayScript();
      if (!ready) {
        setMessage({
          tone: "error",
          text: "Razorpay Checkout could not be loaded in this browser. The order stays unpaid.",
        });
        return;
      }

      const Razorpay = (window as unknown as Record<string, any>)["Razorpay"];
      const checkout = new Razorpay({
        key: init.key_id, // publishable key id only
        order_id: init.razorpay_order_id,
        amount: init.amount_minor, // display only; Razorpay uses the order amount
        currency: init.currency,
        name: "Agentic Commerce (Test Mode)",
        description: `Order ${orderId.slice(0, 8)}`,
        prefill: buyerName ? { name: buyerName } : undefined,
        notes: { internal_order_id: orderId },
        theme: { color: "#4f46e5" },
        modal: {
          ondismiss: () => {
            setMessage({
              tone: "info",
              text: "Payment window closed. The order stays payment pending until a verified payment arrives.",
            });
            void refresh();
          },
        },
        handler: async (response: RazorpayHandlerResponse) => {
          setBusy(true);
          setMessage({ tone: "info", text: "Verifying the payment on the server…" });
          try {
            const result = await verifyPayment({
              data: {
                order_id: orderId,
                razorpay_order_id: response.razorpay_order_id ?? "",
                razorpay_payment_id: response.razorpay_payment_id ?? "",
                razorpay_signature: response.razorpay_signature ?? "",
              },
            });
            if (!result.ok) {
              setMessage({ tone: "error", text: `${result.error.message} (${result.error.code})` });
            } else if (result.verified) {
              setMessage({ tone: "info", text: "Payment verified server-side." });
            } else {
              setMessage({
                tone: "info",
                text: "Payment recorded but not yet verified. The webhook or reconciliation will finish it.",
              });
            }
          } catch (error) {
            setMessage({
              tone: "error",
              text:
                error instanceof Error
                  ? error.message
                  : "Verification failed. The order was not marked as paid.",
            });
          } finally {
            await refresh();
            setBusy(false);
          }
        },
      });
      checkout.open();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Payment could not be started.",
      });
    } finally {
      setBusy(false);
    }
  }

  const activeIndex = state ? PAYMENT_TIMELINE.indexOf(state) : -1;

  return (
    <div className="mt-3 rounded-md border border-border bg-background/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CreditCard className="size-4" /> Payment
          <Badge variant="outline" className="text-[10px] uppercase">
            Razorpay test mode
          </Badge>
        </p>
        <div className="flex items-center gap-2">
          {state ? (
            <Badge variant={verified ? "default" : state === "FAILED" ? "outline" : "secondary"}>
              {PAYMENT_STATE_LABELS[state]}
              {verified ? " ✓" : ""}
            </Badge>
          ) : (
            <Badge variant="outline">Not started</Badge>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => void refresh()}
            aria-label="Refresh payment status"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <dt>Order ID</dt>
        <dd className="text-right font-mono text-xs text-foreground">{orderId}</dd>
        {payment.data?.razorpay_order_id ? (
          <>
            <dt>Razorpay order</dt>
            <dd className="text-right font-mono text-xs text-foreground">
              {payment.data.razorpay_order_id}
            </dd>
          </>
        ) : null}
        {payment.data?.razorpay_payment_id ? (
          <>
            <dt>Razorpay payment</dt>
            <dd className="text-right font-mono text-xs text-foreground">
              {payment.data.razorpay_payment_id}
            </dd>
          </>
        ) : null}
        <dt>Amount</dt>
        <dd className="text-right font-semibold text-foreground">{money(amount, currency)}</dd>
        <dt>Order status</dt>
        <dd className="text-right text-foreground">
          {CHECKOUT_STATE_LABELS[orderStatus]}
          {completed ? " ✓" : ""}
        </dd>
        {payment.data?.method ? (
          <>
            <dt>Method</dt>
            <dd className="text-right text-foreground">{payment.data.method}</dd>
          </>
        ) : null}
        {payment.data?.verified_at ? (
          <>
            <dt>Verified at</dt>
            <dd className="text-right text-foreground">
              {new Date(payment.data.verified_at).toLocaleString("en-IN")}
            </dd>
          </>
        ) : null}
      </dl>

      {state ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PAYMENT_TIMELINE.map((step) => {
            const reached = activeIndex >= PAYMENT_TIMELINE.indexOf(step);
            return (
              <span
                key={step}
                className={
                  reached
                    ? "rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
                    : "rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                }
              >
                {PAYMENT_STATE_LABELS[step]}
              </span>
            );
          })}
        </div>
      ) : null}

      {orderStatus === "PAYMENT_PENDING" && !verified ? (
        <Button className="mt-3" size="sm" onClick={handlePay} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
          Pay securely with Razorpay Test Mode
        </Button>
      ) : null}

      {completed && verified ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-primary">
          <CheckCircle2 className="size-4" /> Payment VERIFIED ✓ · Order COMPLETED ✓
        </p>
      ) : null}

      {state === "FAILED" ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {payment.data?.failure_reason ?? "The payment failed at the provider."} The order was not
            marked as paid.
          </span>
        </p>
      ) : null}

      {message ? (
        <p
          className={
            message.tone === "error"
              ? "mt-3 text-sm text-destructive"
              : "mt-3 text-sm text-muted-foreground"
          }
        >
          {message.text}
        </p>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">
        Test mode only. The amount comes from the server-side order total; the browser cannot change
        it, and the order is completed only after server-side signature verification.
      </p>
    </div>
  );
}
