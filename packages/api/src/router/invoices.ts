import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { desc, eq, and, count, lt, gte } from "@acme/db";
import { saasInvoice, business, subscription } from "@acme/db/schema";
import { PLAN_CATALOG } from "../lib/plans";

import { ownerOnlyProcedure } from "../trpc";

export const invoicesRouter = {
  /** List invoices with pagination and filtering */
  list: ownerOnlyProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
        status: z.enum(["all", "pending", "paid", "failed", "cancelled"]).default("all"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const businessId = ctx.businessId;
      const { limit, cursor, status, startDate, endDate } = input;

      const conditions = [eq(saasInvoice.businessId, businessId)];

      if (cursor) {
        conditions.push(lt(saasInvoice.createdAt, new Date(cursor)));
      }

      if (status !== "all") {
        conditions.push(eq(saasInvoice.status, status));
      }

      if (startDate) {
        conditions.push(gte(saasInvoice.createdAt, new Date(startDate)));
      }

      if (endDate) {
        conditions.push(lt(saasInvoice.createdAt, new Date(endDate)));
      }

      const limitPlusOne = limit + 1;

      const allInvoices = await ctx.db
        .select()
        .from(saasInvoice)
        .where(and(...conditions))
        .orderBy(desc(saasInvoice.createdAt));

      let startIndex = 0;
      if (cursor) {
        const cursorIndex = allInvoices.findIndex((i) => i.createdAt.getTime() === new Date(cursor).getTime());
        if (cursorIndex !== -1) {
          startIndex = cursorIndex + 1;
        }
      }

      const page = allInvoices.slice(startIndex, startIndex + limit + 1);
      const hasMore = page.length > limit;
      const invoices = hasMore ? page.slice(0, limit) : page;

      const nextCursor = hasMore ? invoices[invoices.length - 1]?.createdAt.toISOString() : undefined;

      // Add computed fields for frontend convenience
      const enriched = invoices.map((inv) => ({
        ...inv,
        planName: PLAN_CATALOG[inv.plan as keyof typeof PLAN_CATALOG]?.name ?? inv.plan,
        isOverdue: inv.status === "pending" && inv.periodEnd && new Date(inv.periodEnd) < new Date(),
        daysOverdue: inv.status === "pending" && inv.periodEnd
          ? Math.floor((Date.now() - new Date(inv.periodEnd).getTime()) / (1000 * 60 * 60 * 24))
          : 0,
      }));

      return {
        items: enriched,
        nextCursor: hasMore ? invoices[invoices.length - 1]?.createdAt.toISOString() : undefined,
        hasMore,
      };
    }),

  /** Get single invoice with business name */
  getById: ownerOnlyProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [invoice] = await ctx.db
        .select()
        .from(saasInvoice)
        .where(and(eq(saasInvoice.id, input.id), eq(saasInvoice.businessId, ctx.businessId)))
        .limit(1);

      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });

      const [biz] = await ctx.db.select({ name: business.name }).from(business).where(eq(business.id, ctx.businessId)).limit(1);

      return {
        ...invoice,
        businessName: biz?.name ?? "",
        planName: PLAN_CATALOG[invoice.plan as keyof typeof PLAN_CATALOG]?.name ?? invoice.plan,
        isOverdue: invoice.status === "pending" && invoice.periodEnd && new Date(invoice.periodEnd) < new Date(),
        daysOverdue: invoice.periodEnd ? Math.floor((Date.now() - new Date(invoice.periodEnd).getTime()) / (1000 * 60 * 60 * 24)) : 0,
      };
    }),

  /** Get invoice statistics for the business */
  getStats: ownerOnlyProcedure.query(async ({ ctx }) => {
    const stats = await ctx.db
      .select({
        status: saasInvoice.status,
        count: count(),
        total: count(),
      })
      .from(saasInvoice)
      .where(eq(saasInvoice.businessId, ctx.businessId))
      .groupBy(saasInvoice.status);

    const totals = stats.reduce<Record<string, number>>((acc, s) => {
      acc[s.status] = Number(s.count);
      return acc;
    }, { pending: 0, paid: 0, failed: 0, cancelled: 0 });

    const totalAmount = await ctx.db
      .select({ total: count() })
      .from(saasInvoice)
      .where(eq(saasInvoice.businessId, ctx.businessId));

    return {
      ...totals,
      total: totalAmount[0]?.total ?? 0,
    };
  }),

  /** Download invoice PDF (placeholder - would generate PDF) */
  downloadPdf: ownerOnlyProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [invoice] = await ctx.db
        .select()
        .from(saasInvoice)
        .where(and(eq(saasInvoice.id, input.id), eq(saasInvoice.businessId, ctx.businessId)))
        .limit(1);

      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });

      // TODO: Generate actual PDF - for now return the data
      return {
        success: true,
        data: invoice,
        message: "PDF generation not yet implemented",
      };
    }),
} satisfies TRPCRouterRecord;
