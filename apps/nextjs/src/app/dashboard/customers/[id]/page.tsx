import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../../(home)/_components/dashboard-shell";
import { CustomerDetailClient } from "./customer-detail-client";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const caller = await createCaller(await headers());
  const customer = await caller.customers.getById({ id });

  if (!customer) notFound();

  const serialized = {
    ...customer,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    recentOrders: customer.recentOrders.map((o) => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      paymentConfirmedAt: o.paymentConfirmedAt?.toISOString() ?? null,
    })),
  };

  return (
    <DashboardShell>
      <CustomerDetailClient customer={serialized} />
    </DashboardShell>
  );
}
