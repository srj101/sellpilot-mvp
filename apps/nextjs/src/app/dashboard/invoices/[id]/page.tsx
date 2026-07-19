import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../../(home)/_components/dashboard-shell";
import { InvoiceDetailClient } from "./invoice-detail-client";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const caller = await createCaller(await headers());
  const orderData = await caller.orders.getById({ id });

  if (!orderData) notFound();

  const serialized = {
    ...orderData,
    createdAt: orderData.createdAt.toISOString(),
    updatedAt: orderData.updatedAt.toISOString(),
    paymentConfirmedAt: orderData.paymentConfirmedAt?.toISOString() ?? null,
    items: orderData.items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
  };

  return (
    <DashboardShell>
      <InvoiceDetailClient invoice={serialized} />
    </DashboardShell>
  );
}
