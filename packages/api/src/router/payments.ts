import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, ilike, or, lt } from "@acme/db";
import { businessProfile, order, transaction } from "@acme/db/schema";

import { hasCredentials } from "../lib/sslcommerz";
import { ownerOnlyProcedure, permissionProcedure } from "../trpc";

const DAY = 86_400_000;
const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 } as const;

function trendPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function inWindow(ms: number, start: number, end: number) {
  return ms >= start && ms < end;
}

/**
 * The business's own customer-payment ledger (spec §5.2) — distinct from SellPilot's
 * own SaaS billing in router/subscription.ts. See billing plan D3.
 */
export const paymentsRouter = {
  /** One "Online" status covering card/bank/bKash/Nagad (all one SSLCommerz gateway) —
   * there's nothing to connect per-rail, see billing plan S5-C. Per-business now, not a
   * global env check — each business's own SSLCommerz store, see checkout.ts. */
  getGatewayStatus: permissionProcedure("orders", "view").query(async ({ ctx }) => {
    const profile = await ctx.db.query.businessProfile.findFirst({ where: eq(businessProfile.businessId, ctx.businessId) });
    return {
      online: hasCredentials({
        storeId: profile?.sslcommerzStoreId ?? undefined,
        storePassword: profile?.sslcommerzStorePassword ?? undefined,
      }),
      cod: true,
    };
  }),

  /** This business's own SSLCommerz store — owner-only, since it's a real merchant
   * credential. Never returns the password itself, just whether one's set. */
  getGatewayCredentials: ownerOnlyProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.query.businessProfile.findFirst({ where: eq(businessProfile.businessId, ctx.businessId) });
    return {
      storeId: profile?.sslcommerzStoreId ?? "",
      hasPassword: Boolean(profile?.sslcommerzStorePassword),
    };
  }),

  updateGatewayCredentials: ownerOnlyProcedure
    .input(
      z.object({
        storeId: z.string().min(1),
        // Optional: leave blank on an update to keep the existing stored password.
        storePassword: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.query.businessProfile.findFirst({ where: eq(businessProfile.businessId, ctx.businessId) });
      const storePassword = input.storePassword?.trim() || profile?.sslcommerzStorePassword || null;
      await ctx.db
        .update(businessProfile)
        .set({ sslcommerzStoreId: input.storeId, sslcommerzStorePassword: storePassword })
        .where(eq(businessProfile.businessId, ctx.businessId));
      return { success: true };
    }),

  getSummary: permissionProcedure("orders", "view")
    .input(
      z.object({
        range: z.enum(["7d", "30d", "90d", "1y", "custom"]).default("30d"),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = Date.now();

      let windowStart: number;
      let windowEnd: number;
      if (input.range === "custom" && input.from && input.to) {
        windowStart = new Date(input.from).setHours(0, 0, 0, 0);
        windowEnd = new Date(input.to).setHours(0, 0, 0, 0) + DAY;
      } else {
        const rangeDays = RANGE_DAYS[input.range === "custom" ? "30d" : input.range];
        windowEnd = now;
        windowStart = now - rangeDays * DAY;
      }
      const windowMs = windowEnd - windowStart;
      const prevStart = windowStart - windowMs;
      const prevEnd = windowStart;

      const rows = await ctx.db.select().from(transaction).where(eq(transaction.businessId, ctx.businessId));
      const current = rows.filter((r) => inWindow(r.createdAt.getTime(), windowStart, windowEnd));
      const previous = rows.filter((r) => inWindow(r.createdAt.getTime(), prevStart, prevEnd));

      const sumBy = (list: typeof rows, pred: (r: (typeof rows)[number]) => boolean, field: "amount" | "deliveryCharge" | "refundedAmount") =>
        list.filter(pred).reduce((acc, r) => acc + r[field], 0);

      const totalCollected = sumBy(current, (r) => r.status === "success", "amount");
      const prevCollected = sumBy(previous, (r) => r.status === "success", "amount");

      const pendingCodRows = current.filter((r) => r.method === "cod" && r.status === "pending");
      const pendingCod = pendingCodRows.reduce((a, r) => a + r.amount, 0);

      const deliveryChargesCollected = sumBy(current, (r) => r.status === "success", "deliveryCharge");
      const prevDeliveryCharges = sumBy(previous, (r) => r.status === "success", "deliveryCharge");

      const refunds = sumBy(current, (r) => r.refundedAmount > 0, "refundedAmount");
      const prevRefunds = sumBy(previous, (r) => r.refundedAmount > 0, "refundedAmount");

      return {
        totalCollected,
        totalCollectedTrendPct: trendPct(totalCollected, prevCollected),
        pendingCod,
        pendingCodCount: pendingCodRows.length,
        deliveryChargesCollected,
        deliveryChargesTrendPct: trendPct(deliveryChargesCollected, prevDeliveryCharges),
        refunds,
        refundsTrendPct: trendPct(refunds, prevRefunds),
      };
    }),

  list: permissionProcedure("orders", "view")
    .input(
      z.object({
        method: z.enum(["bkash", "nagad", "card", "internetbank", "cod"]).optional(),
        status: z.enum(["success", "pending", "failed", "refunded"]).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(transaction.businessId, ctx.businessId)];
      if (input.method) conditions.push(eq(transaction.method, input.method));
      if (input.status) conditions.push(eq(transaction.status, input.status));
      if (input.cursor) {
        conditions.push(lt(transaction.createdAt, new Date(input.cursor)));
      }
      if (input.search) {
        const term = `%${input.search}%`;
        const searchClause = or(
          ilike(transaction.reference, term),
          ilike(order.orderNumber, term),
          ilike(order.customerName, term),
          ilike(order.customerPhone, term),
        );
        if (searchClause) conditions.push(searchClause);
      }

      const limitPlusOne = (input.limit ?? 50) + 1;

      const transactions = await ctx.db
        .select({
          id: transaction.id,
          reference: transaction.reference,
          method: transaction.method,
          status: transaction.status,
          amount: transaction.amount,
          deliveryCharge: transaction.deliveryCharge,
          refundedAmount: transaction.refundedAmount,
          createdAt: transaction.createdAt,
          orderId: transaction.orderId,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
        })
        .from(transaction)
        .leftJoin(order, eq(transaction.orderId, order.id))
        .where(and(...conditions))
        .orderBy(desc(transaction.createdAt))
        .limit(limitPlusOne);

      const hasMore = transactions.length > (input.limit ?? 50);
      const items = hasMore ? transactions.slice(0, input.limit ?? 50) : transactions;
      const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : undefined;

      return { items, nextCursor, hasMore };
    }),

  /** Refund a transaction — partial refunds allowed, never more than was actually charged. */
  refund: permissionProcedure("orders", "edit")
    .input(z.object({ id: z.string(), amount: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(transaction)
        .where(and(eq(transaction.id, input.id), eq(transaction.businessId, ctx.businessId)))
        .limit(1);
      if (!row) throw new Error("Transaction not found.");
      if (row.status !== "success") throw new Error("Only successful transactions can be refunded.");

      const newRefundedAmount = row.refundedAmount + input.amount;
      if (newRefundedAmount > row.amount) {
        throw new Error(`Refund amount exceeds the original charge of ৳${row.amount.toLocaleString()}.`);
      }

      await ctx.db
        .update(transaction)
        .set({
          refundedAmount: newRefundedAmount,
          refundedAt: new Date(),
          status: newRefundedAmount >= row.amount ? "refunded" : "success",
        })
        .where(eq(transaction.id, input.id));

      return { ok: true };
    }),
} satisfies TRPCRouterRecord;
