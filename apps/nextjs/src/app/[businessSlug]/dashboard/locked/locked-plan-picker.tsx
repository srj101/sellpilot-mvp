"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import type { PlanKey } from "@acme/api/plans";
import { PLAN_CATALOG, PLAN_KEYS, formatPlanPrice } from "@acme/api/plans";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

/** Monthly-only picker, deliberately simple — a locked business needs the fastest path
 * back in, not a full cycle-comparison UI (that lives on the Pricing page). */
export function LockedPlanPicker() {
  const trpc = useTRPC();
  const [busyPlan, setBusyPlan] = useState<PlanKey | null>(null);

  const subscribe = useMutation(
    trpc.subscription.subscribe.mutationOptions({
      onSuccess: (result) => window.location.assign(result.gatewayUrl),
      onError: (err) => {
        setBusyPlan(null);
        toast.error(err.message);
      },
    }),
  );

  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-3">
      {PLAN_KEYS.map((key) => {
        const plan = PLAN_CATALOG[key];
        return (
          <button
            key={key}
            type="button"
            disabled={subscribe.isPending}
            onClick={() => {
              setBusyPlan(key);
              subscribe.mutate({ plan: key, billingCycle: "monthly" });
            }}
            className={cn(
              "rounded-2xl border bg-background/60 p-5 text-left transition-colors hover:border-primary/50 hover:bg-background disabled:opacity-60",
              plan.popular && "border-primary/40",
            )}
          >
            <p className="text-sm font-semibold">{plan.name}</p>
            <p className="mt-1 text-xl font-bold tracking-tight">
              {formatPlanPrice(plan.prices.monthly)}
              <span className="text-xs font-normal text-muted-foreground">/mo</span>
            </p>
            <p className="mt-2 text-xs font-medium text-primary">
              {busyPlan === key ? "Redirecting…" : "Choose plan →"}
            </p>
          </button>
        );
      })}
    </div>
  );
}
