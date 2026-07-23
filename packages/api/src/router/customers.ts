import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { desc, eq, and, count, sum } from "@acme/db";
import { customer, order } from "@acme/db/schema";

import { storeProcedure } from "../trpc";

export const customersRouter = {
  list: storeProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.organizationId;
    const customers = await ctx.db
      .select()
      .from(customer)
      .where(eq(customer.organizationId, organizationId))
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
          .where(and(eq(order.organizationId, organizationId), eq(order.customerId, c.id)));

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

  getById: storeProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const organizationId = ctx.organizationId;

      const [cust] = await ctx.db
        .select()
        .from(customer)
        .where(and(eq(customer.id, input.id), eq(customer.organizationId, organizationId)))
        .limit(1);

      if (!cust) return null;

      // Get order stats
      const orderStats = await ctx.db
        .select({
          totalOrders: count(),
          totalSpent: sum(order.total),
        })
        .from(order)
        .where(and(eq(order.organizationId, organizationId), eq(order.customerId, input.id)));

      // Get recent orders
      const recentOrders = await ctx.db
        .select()
        .from(order)
        .where(and(eq(order.organizationId, organizationId), eq(order.customerId, input.id)))
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
