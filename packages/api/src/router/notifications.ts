import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { and, desc, eq } from "@acme/db";
import { notification } from "@acme/db/schema";

import { businessScopedProcedure } from "../trpc";

export const notificationsRouter = {
  list: businessScopedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(notification)
        .where(eq(notification.businessId, ctx.businessId))
        .orderBy(desc(notification.createdAt))
        .limit(input?.limit ?? 50);
    }),

  getUnreadCount: businessScopedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ id: notification.id })
      .from(notification)
      .where(and(eq(notification.businessId, ctx.businessId), eq(notification.read, false)));
    return { count: rows.length };
  }),

  markRead: businessScopedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(notification)
        .set({ read: true })
        .where(and(eq(notification.id, input.id), eq(notification.businessId, ctx.businessId)));
      return { ok: true as const };
    }),

  markAllRead: businessScopedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(notification)
      .set({ read: true })
      .where(and(eq(notification.businessId, ctx.businessId), eq(notification.read, false)));
    return { ok: true as const };
  }),
} satisfies TRPCRouterRecord;
