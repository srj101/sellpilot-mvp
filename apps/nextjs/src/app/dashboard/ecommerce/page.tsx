import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";

export default async function EcommercePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Storefront</h1>
        <p className="text-muted-foreground text-base">
          eCommerce overview. Coming up: store-wide KPIs, funnel and AOV.
        </p>
      </div>
    </DashboardShell>
  );
}
