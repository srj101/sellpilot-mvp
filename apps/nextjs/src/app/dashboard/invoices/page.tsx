import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { InvoicesClient } from "./invoices-client";

export default async function InvoicesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const caller = await createCaller(await headers());
  const { orders } = await caller.orders.list();

  // Serialize orders for hydration safety
  const serializedOrders = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    total: o.total,
    customerName: o.customerName,
    createdAt: o.createdAt.toISOString(),
  }));

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            All paid, pending, and overdue billing invoices. Print, share, and download receipts in BDT.
          </p>
        </div>

        <InvoicesClient orders={serializedOrders} />
      </div>
    </DashboardShell>
  );
}
