import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { desc, eq, and, inArray, createCustomerAndOrder, quoteOrder } from "@acme/db";
import { order, orderItem } from "@acme/db/schema";

import { storeProcedure } from "../trpc";

export const ordersRouter = {
  /** Live price/stock preview for the manual order form — same pricing logic the AI agent uses. */
  quote: storeProcedure
    .input(
      z.object({
        productId: z.string(),
        variantId: z.string().optional(),
        quantity: z.number().min(1),
        district: z.string().optional(),
        offerCode: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return quoteOrder({ organizationId: ctx.organizationId, ...input });
    }),

  /**
   * Manual order creation — for when a human agent (not the AI) handled the chat and needs
   * to place the order themselves. Reuses the exact same customer-upsert/pricing/inventory
   * logic as the AI's automatic checkout (createCustomerAndOrder), just triggered by a person.
   */
  create: storeProcedure
    .input(
      z.object({
        threadId: z.string(),
        channel: z.string().default("manual"),
        productId: z.string(),
        variantId: z.string().optional(),
        quantity: z.number().min(1),
        customerName: z.string().min(1),
        phone: z.string().min(1),
        address: z.string().min(1),
        district: z.string().optional(),
        offerCode: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createCustomerAndOrder({ userId: ctx.storeOwnerId, organizationId: ctx.organizationId, ...input });
    }),

  list: storeProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.organizationId;
    const orders = await ctx.db
      .select()
      .from(order)
      .where(eq(order.organizationId, organizationId))
      .orderBy(desc(order.createdAt));

    const items =
      orders.length > 0
        ? await ctx.db.select().from(orderItem).where(inArray(orderItem.orderId, orders.map((o) => o.id)))
        : [];

    return { orders, items };
  }),

  getById: storeProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const organizationId = ctx.organizationId;

      const [ord] = await ctx.db
        .select()
        .from(order)
        .where(and(eq(order.id, input.id), eq(order.organizationId, organizationId)))
        .limit(1);

      if (!ord) return null;

      const items = await ctx.db
        .select()
        .from(orderItem)
        .where(eq(orderItem.orderId, input.id));

      return { ...ord, items };
    }),

  updateStatus: storeProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const organizationId = ctx.organizationId;

      await ctx.db
        .update(order)
        .set({ status: input.status })
        .where(and(eq(order.id, input.id), eq(order.organizationId, organizationId)));

      return { success: true };
    }),

  delete: storeProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = ctx.organizationId;

      // Delete order items first (cascade should handle, but be explicit)
      await ctx.db
        .delete(orderItem)
        .where(eq(orderItem.orderId, input.id));

      await ctx.db
        .delete(order)
        .where(and(eq(order.id, input.id), eq(order.organizationId, organizationId)));

      return { success: true };
    }),
} satisfies TRPCRouterRecord;
