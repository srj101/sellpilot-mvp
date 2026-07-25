import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { CustomersClient } from "./customers-client";

export default async function CustomersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const caller = await createCaller(await headers());
  const customers = await caller.customers.list();

  // Convert dates to ISO strings for hydration
  const serializedCustomers = customers.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <DashboardShell>
      <CustomersClient initialCustomers={serializedCustomers} />
    </DashboardShell>
  );
}
