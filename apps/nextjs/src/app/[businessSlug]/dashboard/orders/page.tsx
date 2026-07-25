import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { OrdersClient } from "./orders-client";

export default async function OrdersPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const caller = await createCaller(await headers());
  const { orders, items } = await caller.orders.list();

  return (
    <DashboardShell>
      <OrdersClient initialOrders={orders} initialItems={items} />
    </DashboardShell>
  );
}
