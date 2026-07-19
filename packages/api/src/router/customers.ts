import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { desc, eq, and, count, sum } from "@acme/db";
import { customer, order } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

export const customersRouter = {
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const customers = await ctx.db
      .select()
      .from(customer)
      .where(eq(customer.userId, userId))
      .orderBy(desc(customer.createdAt));

    // Aggregate order stats per customer
    const customerIds = customers.map((c) => c.id);
    const statsMap = new Map<string, { totalOrders: number; totalSpent: number }>();

    if (customerIds.length > 0) {
      for (const c of customers) {
        const orderStats = await ctx.db
          .select({
            totalOrders: count(),
            totalSpent: sum(order.total),
          })
          .from(order)
          .where(and(eq(order.userId, userId), eq(order.customerId, c.id)));

        statsMap.set(c.id, {
          totalOrders: orderStats[0]?.totalOrders ?? 0,
          totalSpent: Number(orderStats[0]?.totalSpent ?? 0),
        });
      }
    }

    return customers.map((c) => ({
      ...c,
      totalOrders: statsMap.get(c.id)?.totalOrders ?? 0,
      totalSpent: statsMap.get(c.id)?.totalSpent ?? 0,
    }));
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [cust] = await ctx.db
        .select()
        .from(customer)
        .where(and(eq(customer.id, input.id), eq(customer.userId, userId)))
        .limit(1);

      if (!cust) return null;

      // Get order stats
      const orderStats = await ctx.db
        .select({
          totalOrders: count(),
          totalSpent: sum(order.total),
        })
        .from(order)
        .where(and(eq(order.userId, userId), eq(order.customerId, input.id)));

      // Get recent orders
      const recentOrders = await ctx.db
        .select()
        .from(order)
        .where(and(eq(order.userId, userId), eq(order.customerId, input.id)))
        .orderBy(desc(order.createdAt))
        .limit(10);

      return {
        ...cust,
        totalOrders: orderStats[0]?.totalOrders ?? 0,
        totalSpent: Number(orderStats[0]?.totalSpent ?? 0),
        recentOrders,
      };
    }),
} satisfies TRPCRouterRecord;
