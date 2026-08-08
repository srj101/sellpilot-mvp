import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { PricingDashboardClient } from "./pricing-dashboard-client";

export default async function PricingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
      <div className="space-y-8 pb-10">
        <div className="mx-auto max-w-xl space-y-2 pt-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Flexible plans tailored to your growth</h1>
          <p className="text-sm text-muted-foreground">
            Unlock the power of conversational commerce and auto-pilot your sales. No hidden fees. Cancel anytime.
          </p>
        </div>

        <PricingDashboardClient />
      </div>
  );
}
