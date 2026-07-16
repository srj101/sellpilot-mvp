import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../(home)/_components/dashboard-shell";

export default async function CustomersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const caller = await createCaller(await headers());
  const customers = await caller.customers.list();

  return (
    <DashboardShell>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
        <p className="text-muted-foreground text-base">
          {customers.length} customer{customers.length === 1 ? "" : "s"} in
          your database. Full table coming up.
        </p>
      </div>
    </DashboardShell>
  );
}
