"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, CreditCard, Lock } from "lucide-react";

import { CYCLE_META } from "@acme/api/plans";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

function formatCurrency(val: number) {
  return `৳${Math.round(val).toLocaleString()}`;
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function detectBrand(digits: string): "Visa" | "Mastercard" | "Amex" | "Card" {
  if (digits.startsWith("4")) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
  if (digits.startsWith("34") || digits.startsWith("37")) return "Amex";
  return "Card";
}

function luhnValid(digits: string): boolean {
  if (digits.length < 12) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function formatCardNumber(digits: string): string {
  return digits.match(/.{1,4}/g)?.join(" ") ?? digits;
}

export function PaymentMethodClient() {
  const trpc = useTRPC();
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [saveCard, setSaveCard] = useState(true);

  const { data: current } = useQuery(trpc.subscription.getCurrent.queryOptions());

  const digits = cardNumber.replace(/\D/g, "");
  const brand = useMemo(() => detectBrand(digits), [digits]);
  const isLuhnValid = digits.length >= 12 && luhnValid(digits);
  const isExpiryValid = /^\d{2}\/\d{2}$/.test(expiry);
  const canSubmit = isLuhnValid && isExpiryValid && cvc.length >= 3 && name.trim().length > 1;

  const addPaymentMethod = useMutation(
    trpc.subscription.addPaymentMethod.mutationOptions({
      onSuccess: (result) => window.location.assign(result.gatewayUrl),
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <div className="mx-auto max-w-md space-y-6">
      {/* Live card preview */}
      <div className="relative aspect-[1.586/1] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/70 p-6 text-primary-foreground shadow-lg">
        <div className="flex items-start justify-between">
          <CreditCard className="size-8 opacity-80" />
          <span className="text-sm font-semibold tracking-wide">{brand}</span>
        </div>
        <p className="mt-8 font-mono text-xl tracking-widest">
          {digits ? formatCardNumber(digits).padEnd(19, "•") : "•••• •••• •••• ••••"}
        </p>
        <div className="mt-4 flex items-end justify-between text-xs">
          <span className="uppercase opacity-80">{name || "Card Holder"}</span>
          <span className="opacity-80">{expiry || "MM/YY"}</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="cardNumber">Card Number</Label>
          <div className="relative">
            <Input
              id="cardNumber"
              inputMode="numeric"
              placeholder="4242 4242 4242 4242"
              value={cardNumber}
              maxLength={23}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value.replace(/\D/g, "").slice(0, 16)))}
            />
            {digits.length >= 12 && (
              <CheckCircle2
                className={cn(
                  "absolute right-3 top-1/2 size-4 -translate-y-1/2",
                  isLuhnValid ? "text-emerald-500" : "text-muted-foreground/40",
                )}
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="expiry">Expiry (MM/YY)</Label>
            <Input
              id="expiry"
              placeholder="08/28"
              value={expiry}
              maxLength={5}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d/]/g, "");
                const clean = v.replace("/", "");
                setExpiry(clean.length > 2 ? `${clean.slice(0, 2)}/${clean.slice(2, 4)}` : clean);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cvc">CVC</Label>
            <Input
              id="cvc"
              inputMode="numeric"
              placeholder="123"
              value={cvc}
              maxLength={4}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Cardholder Name</Label>
          <Input id="name" placeholder="As shown on card" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="billingAddress">Billing Address</Label>
          <Input
            id="billingAddress"
            placeholder="123 Main St, Dhaka"
            value={billingAddress}
            onChange={(e) => setBillingAddress(e.target.value)}
          />
        </div>

        {/* Same local-preview status as the card fields above — every payment method is
            already always saved server-side once verified via SSLCommerz, this checkbox
            doesn't gate that (there's no "don't save" path in this integration yet). */}
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={saveCard}
            onChange={(e) => setSaveCard(e.target.checked)}
            className="size-4 rounded border-input"
          />
          Save this card for future billing
        </label>

        {current?.plan && (
          <div className="space-y-1.5 rounded-xl border bg-muted/30 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium text-foreground">
                {current.planName} · {current.billingCycle ? CYCLE_META[current.billingCycle].label : ""}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium text-foreground">{formatCurrency(current.amount)}</span>
            </div>
            {current.isTrialing ? (
              <p className="pt-1 text-xs text-muted-foreground">
                You won&apos;t be charged today — this just saves your card. Billing starts when your trial ends
                {current.currentPeriodEnd ? ` on ${formatDate(current.currentPeriodEnd)}` : ""}.
              </p>
            ) : (
              <p className="pt-1 text-xs text-muted-foreground">
                A small verification charge applies now; your regular billing continues on schedule.
              </p>
            )}
          </div>
        )}

        <Button className="w-full gap-2" size="lg" disabled={!canSubmit || addPaymentMethod.isPending} onClick={() => addPaymentMethod.mutate()}>
          <Lock className="size-4" />
          {addPaymentMethod.isPending ? "Redirecting…" : "Continue to Secure Payment"}
        </Button>

        <p className="text-center text-[11px] leading-5 text-muted-foreground">
          Your card details never touch SellPilot&apos;s servers — this preview is local to your
          browser. You&apos;ll enter your real card on SSLCommerz&apos;s secure, PCI-DSS compliant
          checkout page next.
        </p>
      </div>
    </div>
  );
}
