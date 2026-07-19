import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { desc, eq, and, inArray } from "@acme/db";
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

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [ord] = await ctx.db
        .select()
        .from(order)
        .where(and(eq(order.id, input.id), eq(order.userId, userId)))
        .limit(1);

      if (!ord) return null;

      const items = await ctx.db
        .select()
        .from(orderItem)
        .where(eq(orderItem.orderId, input.id));

      return { ...ord, items };
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await ctx.db
        .update(order)
        .set({ status: input.status })
        .where(and(eq(order.id, input.id), eq(order.userId, userId)));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Delete order items first (cascade should handle, but be explicit)
      await ctx.db
        .delete(orderItem)
        .where(eq(orderItem.orderId, input.id));

      await ctx.db
        .delete(order)
        .where(and(eq(order.id, input.id), eq(order.userId, userId)));

      return { success: true };
    }),
} satisfies TRPCRouterRecord;
