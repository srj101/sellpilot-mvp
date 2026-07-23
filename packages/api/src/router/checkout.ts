import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { eq } from "@acme/db";
import { businessProfile, order, orderItem, pageView } from "@acme/db/schema";

import { initiatePayment, isSslcommerzConfigured, validatePayment } from "../lib/sslcommerz";
import { publicProcedure } from "../trpc";

/**
 * Public (unauthenticated) procedures for the customer-facing /pay/[token] checkout
 * page and the SSLCommerz webhook callbacks. The paymentToken is the only auth
 * boundary here — anyone with the token can view/pay that one order, same as any
 * e-commerce checkout link.
 */
export const checkoutRouter = {
  getOrderByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const orderRow = await ctx.db.query.order.findFirst({
        where: eq(order.paymentToken, input.token),
      });
      if (!orderRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      }

      const [items, profile, [view]] = await Promise.all([
        ctx.db.select().from(orderItem).where(eq(orderItem.orderId, orderRow.id)),
        ctx.db.query.businessProfile.findFirst({ where: eq(businessProfile.organizationId, orderRow.organizationId) }),
        ctx.db
          .insert(pageView)
          .values({
            userId: orderRow.userId,
            organizationId: orderRow.organizationId,
            orderId: orderRow.id,
            sessionId: crypto.randomUUID(),
            path: `/pay/${input.token}`,
            referrerChannel: orderRow.channel,
            district: orderRow.shippingDistrict,
          })
          .returning(),
      ]);

      return {
        businessName: profile?.name ?? "Your order",
        order: {
          orderNumber: orderRow.orderNumber,
          status: orderRow.status,
          subtotal: orderRow.subtotal,
          shippingCost: orderRow.shippingCost,
          discountAmount: orderRow.discountAmount,
          total: orderRow.total,
          customerName: orderRow.customerName,
          customerPhone: orderRow.customerPhone,
          shippingAddress: orderRow.shippingAddress,
          shippingDistrict: orderRow.shippingDistrict,
        },
        items: items.map((i) => ({
          id: i.id,
          name: i.name,
          variantTitle: i.variantTitle,
          qty: i.qty,
          lineTotal: i.lineTotal,
        })),
        pageViewId: view?.id ?? null,
        sslcommerzConfigured: isSslcommerzConfigured(),
      };
    }),

  recordPageLeave: publicProcedure
    .input(z.object({ pageViewId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(pageView).set({ leftAt: new Date() }).where(eq(pageView.id, input.pageViewId));
      return { ok: true };
    }),

  confirmCod: publicProcedure
    .input(z.object({ token: z.string(), pageViewId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const orderRow = await ctx.db.query.order.findFirst({ where: eq(order.paymentToken, input.token) });
      if (!orderRow) return { ok: false as const, reason: "Order not found." };
      if (orderRow.status !== "pending") {
        return { ok: false as const, reason: "This order has already been processed." };
      }

      await ctx.db.update(order).set({ status: "confirmed", paymentMethod: "cod" }).where(eq(order.id, orderRow.id));
      if (input.pageViewId) {
        await ctx.db.update(pageView).set({ converted: true }).where(eq(pageView.id, input.pageViewId));
      }
      return { ok: true as const };
    }),

  startOnlinePayment: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orderRow = await ctx.db.query.order.findFirst({ where: eq(order.paymentToken, input.token) });
      if (!orderRow) return { ok: false as const, reason: "Order not found." };
      if (orderRow.status !== "pending") {
        return { ok: false as const, reason: "This order has already been processed." };
      }

      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const base = `${appUrl}/api/payments/sslcommerz`;
      const result = await initiatePayment({
        transactionId: input.token,
        amount: orderRow.total,
        customerName: orderRow.customerName,
        customerPhone: orderRow.customerPhone ?? "N/A",
        customerAddress: orderRow.shippingAddress ?? undefined,
        productName: `Order #${orderRow.orderNumber}`,
        successUrl: `${base}/success`,
        failUrl: `${base}/fail`,
        cancelUrl: `${base}/cancel`,
        ipnUrl: `${base}/ipn`,
      });

      if (!result.ok) return { ok: false as const, reason: result.reason };
      return { ok: true as const, gatewayUrl: result.gatewayUrl };
    }),

  /** Called by the SSLCommerz success/ipn route handlers (not by the browser). */
  markOrderPaid: publicProcedure
    .input(z.object({ tranId: z.string(), valId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await validatePayment(input.valId);
      if (!result.valid || result.transactionId !== input.tranId) return { ok: false };

      const orderRow = await ctx.db.query.order.findFirst({ where: eq(order.paymentToken, input.tranId) });
      if (!orderRow) return { ok: false };

      if (orderRow.status === "pending" || orderRow.status === "confirmed") {
        await ctx.db.update(order).set({ status: "paid", paymentMethod: "sslcommerz", paymentConfirmedAt: new Date() }).where(eq(order.id, orderRow.id));
      }
      await ctx.db.update(pageView).set({ converted: true }).where(eq(pageView.orderId, orderRow.id));
      return { ok: true };
    }),
} satisfies TRPCRouterRecord;
