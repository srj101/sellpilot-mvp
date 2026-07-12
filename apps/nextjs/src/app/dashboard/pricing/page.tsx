import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";

export default async function PricingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground text-base">
          Starter, Pro, and Enterprise plans. Monthly and yearly billing — full
          comparison table coming up.
        </p>
      </div>
    </DashboardShell>
  );
}
