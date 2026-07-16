import type { TRPCRouterRecord } from "@trpc/server";

import { desc, eq, inArray } from "@acme/db";
import { order, orderItem } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

export const ordersRouter = {
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const orders = await ctx.db
      .select()
      .from(order)
      .where(eq(order.userId, userId))
      .orderBy(desc(order.createdAt));

    const items =
      orders.length > 0
        ? await ctx.db.select().from(orderItem).where(inArray(orderItem.orderId, orders.map((o) => o.id)))
        : [];

    return { orders, items };
  }),
} satisfies TRPCRouterRecord;
