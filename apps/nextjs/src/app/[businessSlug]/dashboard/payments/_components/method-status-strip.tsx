"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Truck, Wallet } from "lucide-react";

import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

export function MethodStatusStrip() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.payments.getGatewayStatus.queryOptions());

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
          data?.online ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400" : "border-amber-500/30 bg-amber-500/5 text-amber-600",
        )}
      >
        <Wallet className="size-3.5" />
        Online (Card · Bank · bKash · Nagad)
        {data?.online ? <CheckCircle2 className="size-3.5" /> : <CircleAlert className="size-3.5" />}
        <span className="font-semibold">{data?.online ? "Connected" : "Not configured"}</span>
      </div>
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Truck className="size-3.5" />
        Cash on Delivery
        <CheckCircle2 className="size-3.5" />
        <span className="font-semibold">Enabled</span>
      </div>
    </div>
  );
}
