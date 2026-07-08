import { redirect } from "next/navigation";

import { desc, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { order, orderItem } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { OrdersClient } from "./orders-client";

export default async function OrdersPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const orders = await db
    .select()
    .from(order)
    .where(eq(order.userId, session.user.id))
    .orderBy(desc(order.createdAt));

  const items =
    orders.length > 0
      ? await db
          .select()
          .from(orderItem)
          .where(inArray(orderItem.orderId, orders.map((o) => o.id)))
      : [];

  return (
    <DashboardShell>
      <OrdersClient initialOrders={orders} initialItems={items} />
    </DashboardShell>
  );
}
