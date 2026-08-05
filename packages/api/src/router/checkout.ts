import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { eq, createNotification } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { businessProfile, order, orderItem, pageView, transaction } from "@acme/db/schema";
import { getNotificationPreference } from "@acme/db/helpers/notification-preferences";

import { enqueueOrderStatusNotify } from "../lib/notify-queue";
import { getPlanFeatureEnabled } from "../lib/plan-limits";
import { hasCredentials, initiatePayment, validatePayment } from "../lib/sslcommerz";
import { publicProcedure } from "../trpc";

/** This order's OWN business's SSLCommerz credentials — never the platform's (see
 * sslcommerz.ts's header comment). Returns null if the business hasn't set theirs up yet. */
async function getBusinessSslcommerzCredentials(db: typeof Db, businessId: string) {
  const profile = await db.query.businessProfile.findFirst({ where: eq(businessProfile.businessId, businessId) });
  if (!hasCredentials({ storeId: profile?.sslcommerzStoreId ?? undefined, storePassword: profile?.sslcommerzStorePassword ?? undefined })) {
    return null;
  }
  return {
    storeId: profile!.sslcommerzStoreId!,
    storePassword: profile!.sslcommerzStorePassword!,
  };
}

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

      const [items, profile, [view], whiteLabelEnabled] = await Promise.all([
        ctx.db.select().from(orderItem).where(eq(orderItem.orderId, orderRow.id)),
        ctx.db.query.businessProfile.findFirst({ where: eq(businessProfile.businessId, orderRow.businessId) }),
        ctx.db
          .insert(pageView)
          .values({
            userId: orderRow.userId,
            businessId: orderRow.businessId,
            orderId: orderRow.id,
            sessionId: crypto.randomUUID(),
            path: `/pay/${input.token}`,
            referrerChannel: orderRow.channel,
            district: orderRow.shippingDistrict,
          })
          .returning(),
        getPlanFeatureEnabled({ db: ctx.db, businessId: orderRow.businessId }, "whiteLabel"),
      ]);

      return {
        businessName: profile?.name ?? "Your order",
        // Pro-only (B.9) — the merchant's own logo on their customers' checkout page.
        logoUrl: whiteLabelEnabled ? (profile?.logoUrl ?? null) : null,
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
        sslcommerzConfigured: hasCredentials({
          storeId: profile?.sslcommerzStoreId ?? undefined,
          storePassword: profile?.sslcommerzStorePassword ?? undefined,
        }),
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
      // COD is "pending" in the transaction ledger, not "success" — the money hasn't
      // actually changed hands yet, it's collected at delivery (Payments page S5-A).
      await ctx.db.insert(transaction).values({
        businessId: orderRow.businessId,
        orderId: orderRow.id,
        reference: orderRow.orderNumber,
        method: "cod",
        status: "pending",
        amount: orderRow.total,
        deliveryCharge: orderRow.shippingCost,
      });
      await enqueueOrderStatusNotify(orderRow.businessId, orderRow.id);

      // FR-SET-04: gate in-app notification on inAppEnabled preference
      const { inAppEnabled } = await getNotificationPreference(orderRow.businessId, "new_order");
      if (inAppEnabled) {
        await createNotification({
          businessId: orderRow.businessId,
          type: "cod_confirmed",
          title: `Order #${orderRow.orderNumber} confirmed (COD)`,
          body: `৳${orderRow.total.toLocaleString()} — cash on delivery`,
          link: "/dashboard/orders",
        }).catch((err) => console.error("[checkout.confirmCod] Failed to create notification:", err));
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

      const credentials = await getBusinessSslcommerzCredentials(ctx.db, orderRow.businessId);
      if (!credentials) {
        return { ok: false as const, reason: "Online payment isn't set up for this store yet — please choose Cash on Delivery." };
      }

      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const base = `${appUrl}/api/payments/sslcommerz`;
      const result = await initiatePayment({
        credentials,
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
      const orderRow = await ctx.db.query.order.findFirst({ where: eq(order.paymentToken, input.tranId) });
      if (!orderRow) return { ok: false };

      const credentials = await getBusinessSslcommerzCredentials(ctx.db, orderRow.businessId);
      if (!credentials) return { ok: false };

      const result = await validatePayment(input.valId, credentials);
      if (!result.valid || result.transactionId !== input.tranId) return { ok: false };

      // The real rail (bkash/nagad/card/internetbank), not the flat "sslcommerz" string —
      // see billing plan D8. Without this the Payments page can never show a per-method
      // breakdown, no matter how the UI is built.
      const method = result.method ?? "card";

      if (orderRow.status === "pending" || orderRow.status === "confirmed") {
        await ctx.db.update(order).set({ status: "paid", paymentMethod: method, paymentConfirmedAt: new Date() }).where(eq(order.id, orderRow.id));
        await ctx.db.insert(transaction).values({
          businessId: orderRow.businessId,
          orderId: orderRow.id,
          reference: input.valId,
          method,
          status: "success",
          amount: orderRow.total,
          deliveryCharge: orderRow.shippingCost,
        });
        await enqueueOrderStatusNotify(orderRow.businessId, orderRow.id);

        // FR-SET-04: gate in-app notification on inAppEnabled preference
        const { inAppEnabled } = await getNotificationPreference(orderRow.businessId, "new_order");
        if (inAppEnabled) {
          await createNotification({
            businessId: orderRow.businessId,
            type: "payment_received",
            title: `Payment received — order #${orderRow.orderNumber}`,
            body: `৳${orderRow.total.toLocaleString()} via ${method}`,
            link: "/dashboard/orders",
          }).catch((err) => console.error("[checkout.markOrderPaid] Failed to create notification:", err));
        }
      }
      await ctx.db.update(pageView).set({ converted: true }).where(eq(pageView.orderId, orderRow.id));
      return { ok: true };
    }),
} satisfies TRPCRouterRecord;
