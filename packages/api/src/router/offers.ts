import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq } from "@acme/db";
import { offer } from "@acme/db/schema";

import { storeProcedure } from "../trpc";

export const offersRouter = {
  list: storeProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(offer)
      .where(eq(offer.organizationId, ctx.organizationId))
      .orderBy(desc(offer.createdAt));
  }),

  create: storeProcedure
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
          userId: ctx.storeOwnerId,
          organizationId: ctx.organizationId,
          ...input,
        })
        .returning();
      return newOffer;
    }),

  update: storeProcedure
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
        .where(and(eq(offer.id, id), eq(offer.organizationId, ctx.organizationId)))
        .returning();
      return updatedOffer;
    }),

  delete: storeProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [deletedOffer] = await ctx.db
        .delete(offer)
        .where(and(eq(offer.id, input.id), eq(offer.organizationId, ctx.organizationId)))
        .returning();
      return deletedOffer;
    }),
} satisfies TRPCRouterRecord;
