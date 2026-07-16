"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Truck, XCircle } from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";

import { useTRPC } from "~/trpc/react";
import type { OrderItemSummary, OrderSummary } from "./pay-types";
import { formatCurrency } from "./pay-utils";

export function PayClient({
  token,
  businessName,
  order,
  items,
  pageViewId,
  sslcommerzConfigured,
  initialStatus,
}: {
  token: string;
  businessName: string;
  order: OrderSummary;
  items: OrderItemSummary[];
  pageViewId: string | null;
  sslcommerzConfigured: boolean;
  initialStatus: string | null;
}) {
  const trpc = useTRPC();
  const [status, setStatus] = useState(order.status);
  const [error, setError] = useState<string | null>(null);

  const confirmCod = useMutation(trpc.checkout.confirmCod.mutationOptions());
  const startOnlinePayment = useMutation(trpc.checkout.startOnlinePayment.mutationOptions());
  const recordPageLeave = useMutation(trpc.checkout.recordPageLeave.mutationOptions());

  // Record how long the customer actually spent on this checkout page.
  useEffect(() => {
    if (!pageViewId) return;
    const sendLeave = () => {
      recordPageLeave.mutate({ pageViewId });
    };
    window.addEventListener("pagehide", sendLeave);
    return () => window.removeEventListener("pagehide", sendLeave);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-bind if the pageView id changes
  }, [pageViewId]);

  const isPendingStatus = status === "pending";
  const isTerminal = status === "cancelled" || status === "returned";
  const isBusy = confirmCod.isPending || startOnlinePayment.isPending;

  function handleCod() {
    setError(null);
    confirmCod.mutate(
      { token, pageViewId },
      {
        onSuccess: (result) => {
          if (result.ok) setStatus("confirmed");
          else setError(result.reason);
        },
      },
    );
  }

  function handleOnlinePayment() {
    setError(null);
    startOnlinePayment.mutate(
      { token },
      {
        onSuccess: (result) => {
          if (result.ok) {
            window.location.href = result.gatewayUrl;
          } else {
            setError(result.reason);
          }
        },
      },
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg space-y-4 bg-muted/30 px-4 py-8">
      <div className="text-center">
        <p className="text-sm font-semibold text-muted-foreground">{businessName}</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Order #{order.orderNumber}</h1>
      </div>

      {initialStatus === "fail" && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400">
          Payment failed. Please try again or choose Cash on Delivery.
        </div>
      )}
      {initialStatus === "cancel" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
          Payment was cancelled.
        </div>
      )}

      {status !== "pending" && (
        <div
          className={
            isTerminal
              ? "flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400"
              : "flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
          }
        >
          {isTerminal ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {isTerminal ? "This order was cancelled." : `Order ${status} — thank you!`}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.variantTitle ? `${item.variantTitle} · ` : ""}Qty {item.qty}
                  </p>
                </div>
                <p className="font-semibold tabular-nums text-foreground">{formatCurrency(item.lineTotal)}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span className="tabular-nums">{formatCurrency(order.shippingCost)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Discount</span>
                <span className="tabular-nums">-{formatCurrency(order.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 text-base font-bold text-foreground">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-medium text-foreground">{order.customerName}</p>
          {order.customerPhone && <p className="text-muted-foreground">{order.customerPhone}</p>}
          {order.shippingAddress && (
            <p className="text-muted-foreground">
              {order.shippingAddress}
              {order.shippingDistrict ? `, ${order.shippingDistrict}` : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {isPendingStatus && (
        <Card>
          <CardHeader>
            <CardTitle>Choose Payment Method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                {error}
              </p>
            )}
            <Button className="w-full" disabled={isBusy || !sslcommerzConfigured} onClick={handleOnlinePayment}>
              Pay Now — bKash / Nagad / Card
            </Button>
            {!sslcommerzConfigured && (
              <p className="text-center text-xs text-muted-foreground">
                Online payment isn&apos;t set up yet — please choose Cash on Delivery below.
              </p>
            )}
            <Button className="w-full" variant="outline" disabled={isBusy} onClick={handleCod}>
              <Truck className="h-4 w-4" />
              Cash on Delivery
            </Button>
          </CardContent>
        </Card>
      )}

      {!isPendingStatus && !isTerminal && (
        <div className="flex justify-center">
          <Badge variant="secondary" className="capitalize">
            {status}
          </Badge>
        </div>
      )}
    </div>
  );
}
