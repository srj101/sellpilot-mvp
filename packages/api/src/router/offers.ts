import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq } from "@acme/db";
import { offer } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

export const offersRouter = {
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(offer)
      .where(eq(offer.userId, ctx.session.user.id))
      .orderBy(desc(offer.createdAt));
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        code: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        type: z.enum(["percentage", "fixed"]).default("percentage"),
        value: z.number(),
        minSubtotal: z.number().default(0),
        startDate: z.date().optional(),
        endDate: z.date().nullable().optional(),
        active: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [newOffer] = await ctx.db
        .insert(offer)
        .values({
          userId: ctx.session.user.id,
          ...input,
        })
        .returning();
      return newOffer;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1),
        code: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        type: z.enum(["percentage", "fixed"]),
        value: z.number(),
        minSubtotal: z.number(),
        startDate: z.date().optional(),
        endDate: z.date().nullable().optional(),
        active: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updatedOffer] = await ctx.db
        .update(offer)
        .set(data)
        .where(and(eq(offer.id, id), eq(offer.userId, ctx.session.user.id)))
        .returning();
      return updatedOffer;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [deletedOffer] = await ctx.db
        .delete(offer)
        .where(and(eq(offer.id, input.id), eq(offer.userId, ctx.session.user.id)))
        .returning();
      return deletedOffer;
    }),
} satisfies TRPCRouterRecord;
