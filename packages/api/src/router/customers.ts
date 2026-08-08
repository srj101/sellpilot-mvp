import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { desc, eq, and, count, sum } from "@acme/db";
import { customer, order } from "@acme/db/schema";

import { enqueueActivityLog } from "../lib/activity-queue";
import { permissionProcedure } from "../trpc";

export const customersRouter = {
  list: permissionProcedure("customers", "view").query(async ({ ctx }) => {
    const businessId = ctx.businessId;
    const customers = await ctx.db
      .select()
      .from(customer)
      .where(eq(customer.businessId, businessId))
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
          .where(and(eq(order.businessId, businessId), eq(order.customerId, c.id)));

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

  getById: permissionProcedure("customers", "view")
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      const [cust] = await ctx.db
        .select()
        .from(customer)
        .where(and(eq(customer.id, input.id), eq(customer.businessId, businessId)))
        .limit(1);

      if (!cust) return null;

      // Get order stats
      const orderStats = await ctx.db
        .select({
          totalOrders: count(),
          totalSpent: sum(order.total),
        })
        .from(order)
        .where(and(eq(order.businessId, businessId), eq(order.customerId, input.id)));

      // Get recent orders
      const recentOrders = await ctx.db
        .select()
        .from(order)
        .where(and(eq(order.businessId, businessId), eq(order.customerId, input.id)))
        .orderBy(desc(order.createdAt))
        .limit(10);

      return {
        ...cust,
        totalOrders: orderStats[0]?.totalOrders ?? 0,
        totalSpent: Number(orderStats[0]?.totalSpent ?? 0),
        recentOrders,
      };
    }),

  create: permissionProcedure("customers", "create")
    .input(
      z.object({
        name: z.string().min(1),
        phone: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional(),
        district: z.string().optional(),
        country: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      const [newCustomer] = await ctx.db
        .insert(customer)
        .values({
          businessId,
          name: input.name,
          phone: input.phone || null,
          email: input.email || null,
          address: input.address || null,
          district: input.district || null,
          country: input.country || null,
          notes: input.notes || null,
        })
        .returning();

      await enqueueActivityLog({
        businessId,
        actorUserId: ctx.session.user.id,
        actorName: ctx.session.user.name ?? "Staff Member",
        actorType: "staff",
        action: "customer.create",
        entityType: "customer",
        entityId: newCustomer?.id,
        summary: `${ctx.session.user.name ?? "Staff"} created customer "${newCustomer?.name}"`,
      });

      return newCustomer;
    }),

  update: permissionProcedure("customers", "edit")
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional(),
        district: z.string().optional(),
        country: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = ctx.businessId;
      const { id, ...data } = input;

      const [updated] = await ctx.db
        .update(customer)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(eq(customer.id, id), eq(customer.businessId, businessId)))
        .returning();

      if (updated) {
        await enqueueActivityLog({
          businessId,
          actorUserId: ctx.session.user.id,
          actorName: ctx.session.user.name ?? "Staff Member",
          actorType: "staff",
          action: "customer.update",
          entityType: "customer",
          entityId: updated.id,
          summary: `${ctx.session.user.name ?? "Staff"} updated customer "${updated.name}"`,
        });
      }

      return updated ?? null;
    }),

  delete: permissionProcedure("customers", "delete")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      await ctx.db
        .delete(customer)
        .where(and(eq(customer.id, input.id), eq(customer.businessId, businessId)));

      await enqueueActivityLog({
        businessId,
        actorUserId: ctx.session.user.id,
        actorName: ctx.session.user.name ?? "Staff Member",
        actorType: "staff",
        action: "customer.delete",
        entityType: "customer",
        entityId: input.id,
        summary: `${ctx.session.user.name ?? "Staff"} deleted customer`,
      });

      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
