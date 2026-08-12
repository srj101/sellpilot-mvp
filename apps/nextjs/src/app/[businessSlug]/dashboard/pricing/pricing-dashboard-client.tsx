"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import type { BillingCycle, PlanKey } from "@acme/api/plans";
import { toast } from "@acme/ui/toast";

import { PlanGrid } from "~/app/_components/pricing/plan-grid";
import { useTRPC } from "~/trpc/react";

export function PricingDashboardClient() {
  const trpc = useTRPC();
  const { data: current } = useQuery(trpc.subscription.getCurrent.queryOptions());
  const [busyPlan, setBusyPlan] = useState<PlanKey | null>(null);

  const subscribe = useMutation(
    trpc.subscription.subscribe.mutationOptions({
      onSuccess: (result) => {
        window.location.assign(result.gatewayUrl);
      },
      onError: (err) => {
        setBusyPlan(null);
        toast.error(err.message);
      },
    }),
  );

  function handleChoosePlan(plan: PlanKey, cycle: BillingCycle, extraConversations: number) {
    setBusyPlan(plan);
    subscribe.mutate({ plan, billingCycle: cycle, extraConversations });
  }

  return (
    <PlanGrid
      mode="dashboard"
      dashboardState={{
        currentPlan: current?.plan ?? null,
        isTrialing: current?.isTrialing ?? false,
        pendingPlan: current?.pendingPlan ?? null,
        extraConversations: current?.extraConversations ?? 0,
      }}
      onChoosePlan={handleChoosePlan}
      busyPlan={busyPlan}
    />
  );
}
