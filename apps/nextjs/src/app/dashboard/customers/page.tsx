import { redirect } from "next/navigation";

import { desc, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { customer } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";

export default async function CustomersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const customers = await db
    .select()
    .from(customer)
    .where(eq(customer.userId, session.user.id))
    .orderBy(desc(customer.createdAt));

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
