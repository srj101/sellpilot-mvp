import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";

export default async function BillingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground text-base">
          Pay with bKash, Nagad, Visa, or Mastercard through SSLCommerz.
        </p>
      </div>
    </DashboardShell>
  );
}
