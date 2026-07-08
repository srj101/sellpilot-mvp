import { redirect } from "next/navigation";

import { desc, eq, and, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import {
  order,
  orderItem,
  product,
  customer,
  offer,
  metaWebhookEvent,
} from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { DashboardShell } from "./_components/dashboard-shell";
import { DashboardClient } from "./_components/dashboard-client";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const userId = session.user.id;

  const [orders, products, customers, offers, recentEvents] =
    await Promise.all([
      db
        .select()
        .from(order)
        .where(eq(order.userId, userId))
        .orderBy(desc(order.createdAt)),
      db.select().from(product).where(eq(product.userId, userId)),
      db.select().from(customer).where(eq(customer.userId, userId)),
      db.select().from(offer).where(eq(offer.userId, userId)),
      db
        .select()
        .from(metaWebhookEvent)
        .where(
          and(
            eq(metaWebhookEvent.userId, userId),
            inArray(metaWebhookEvent.eventType, ["message", "messages", "outbound"]),
          ),
        )
        .orderBy(desc(metaWebhookEvent.receivedAt))
        .limit(500),
    ]);

  // Get order items for recent orders
  const recentOrderIds = orders.slice(0, 10).map((o) => o.id);
  const recentItems =
    recentOrderIds.length > 0
      ? await db
          .select()
          .from(orderItem)
          .where(inArray(orderItem.orderId, recentOrderIds))
      : [];

  return (
    <DashboardShell>
      <DashboardClient
        userName={session.user.name ?? "User"}
        orders={orders.map((o) => ({
          ...o,
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.updatedAt.toISOString(),
        }))}
        productCount={products.length}
        customerCount={customers.length}
        activeOfferCount={
          offers.filter(
            (o) =>
              o.active && (!o.endDate || new Date(o.endDate) > new Date()),
          ).length
        }
        recentItems={recentItems.map((i) => ({
          ...i,
          createdAt: i.createdAt.toISOString(),
        }))}
        messageStats={{
          total: recentEvents.length,
          inbound: recentEvents.filter((e) => e.eventType !== "outbound").length,
          outbound: recentEvents.filter((e) => e.eventType === "outbound").length,
          platformBreakdown: {
            instagram: recentEvents.filter((e) => e.platform === "instagram").length,
            whatsapp: recentEvents.filter((e) => e.platform === "whatsapp").length,
            facebook: recentEvents.filter(
              (e) => e.platform === "facebook_page",
            ).length,
          },
        }}
      />
    </DashboardShell>
  );
}
