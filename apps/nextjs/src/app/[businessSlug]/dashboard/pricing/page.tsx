import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { PricingDashboardClient } from "./pricing-dashboard-client";

export default async function PricingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Owner-only — choosing/changing the subscription plan is a billing decision, and
  // hiding the sidebar link isn't access control, so this page enforces it too, not
  // just subscription.subscribe/changePlan (both already ownerOnlyProcedure).
  const caller = await createCaller(await headers());
  const { role } = await caller.roles.getMyPermissions();

  return (
      <div className="space-y-8 pb-10">
        <div className="mx-auto max-w-xl space-y-2 pt-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Flexible plans tailored to your growth</h1>
          <p className="text-sm text-muted-foreground">
            Unlock the power of conversational commerce and auto-pilot your sales. No hidden fees. Cancel anytime.
          </p>
        </div>

        {role !== "owner" ? (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl border py-16 text-center">
            <ShieldAlert className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Only the business owner can view pricing plans.</p>
            <p className="text-xs text-muted-foreground">Ask the business owner if you need the plan changed.</p>
          </div>
        ) : (
          <PricingDashboardClient />
        )}
      </div>
  );
}
