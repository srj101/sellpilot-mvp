import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { desc, eq, and, inArray, createCustomerAndOrder, quoteOrder } from "@acme/db";
import { order, orderItem, transaction } from "@acme/db/schema";

import { businessScopedProcedure } from "../trpc";

export const ordersRouter = {
  /** Live price/stock preview for the manual order form — same pricing logic the AI agent uses. */
  quote: businessScopedProcedure
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
      return quoteOrder({ businessId: ctx.businessId, ...input });
    }),

  /**
   * Manual order creation — for when a human agent (not the AI) handled the chat and needs
   * to place the order themselves. Reuses the exact same customer-upsert/pricing/inventory
   * logic as the AI's automatic checkout (createCustomerAndOrder), just triggered by a person.
   */
  create: businessScopedProcedure
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
      return createCustomerAndOrder({ userId: ctx.businessOwnerId, businessId: ctx.businessId, ...input });
    }),

  list: businessScopedProcedure.query(async ({ ctx }) => {
    const businessId = ctx.businessId;
    const orders = await ctx.db
      .select()
      .from(order)
      .where(eq(order.businessId, businessId))
      .orderBy(desc(order.createdAt));

    const items =
      orders.length > 0
        ? await ctx.db.select().from(orderItem).where(inArray(orderItem.orderId, orders.map((o) => o.id)))
        : [];

    return { orders, items };
  }),

  getById: businessScopedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      const [ord] = await ctx.db
        .select()
        .from(order)
        .where(and(eq(order.id, input.id), eq(order.businessId, businessId)))
        .limit(1);

      if (!ord) return null;

      const items = await ctx.db
        .select()
        .from(orderItem)
        .where(eq(orderItem.orderId, input.id));

      return { ...ord, items };
    }),

  updateStatus: businessScopedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      await ctx.db
        .update(order)
        .set({ status: input.status })
        .where(and(eq(order.id, input.id), eq(order.businessId, businessId)));

      // COD money is only actually collected at the doorstep — flip the ledger entry from
      // "pending" to "success" once delivery is confirmed, so the Payments page's Pending
      // COD vs Total Collected split reflects reality, not just order status.
      if (input.status === "delivered") {
        await ctx.db
          .update(transaction)
          .set({ status: "success" })
          .where(and(eq(transaction.orderId, input.id), eq(transaction.method, "cod"), eq(transaction.status, "pending")));
      }
      if (input.status === "cancelled" || input.status === "returned") {
        await ctx.db
          .update(transaction)
          .set({ status: "failed" })
          .where(and(eq(transaction.orderId, input.id), eq(transaction.method, "cod"), eq(transaction.status, "pending")));
      }

      return { success: true };
    }),

  delete: businessScopedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      // Delete order items first (cascade should handle, but be explicit)
      await ctx.db
        .delete(orderItem)
        .where(eq(orderItem.orderId, input.id));

      await ctx.db
        .delete(order)
        .where(and(eq(order.id, input.id), eq(order.businessId, businessId)));

      return { success: true };
    }),
} satisfies TRPCRouterRecord;
