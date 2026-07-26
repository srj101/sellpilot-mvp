import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, inArray } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { offer, product } from "@acme/db/schema";

import { businessScopedProcedure } from "../trpc";

/** Combo fields are only meaningful as a pair — verifies both products actually belong to
 * this business (defense in depth; the FK alone would still block a cross-tenant id, but
 * this gives a clean error instead of a raw constraint violation) and rejects a lone half
 * of a pair, which would silently create an unmatchable combo offer. */
async function assertValidCombo(
  db: typeof Db,
  businessId: string,
  comboProductAId?: string | null,
  comboProductBId?: string | null,
): Promise<void> {
  if (!comboProductAId && !comboProductBId) return;
  if (!comboProductAId || !comboProductBId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A combo offer needs both products selected." });
  }
  if (comboProductAId === comboProductBId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Combo products must be two different products." });
  }
  const rows = await db
    .select({ id: product.id })
    .from(product)
    .where(and(eq(product.businessId, businessId), inArray(product.id, [comboProductAId, comboProductBId])));
  if (rows.length !== 2) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "One or both combo products weren't found." });
  }
}

export const offersRouter = {
  list: businessScopedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(offer)
      .where(eq(offer.businessId, ctx.businessId))
      .orderBy(desc(offer.createdAt));
  }),

  create: businessScopedProcedure
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
        comboProductAId: z.string().nullable().optional(),
        comboProductBId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertValidCombo(ctx.db, ctx.businessId, input.comboProductAId, input.comboProductBId);
      const [newOffer] = await ctx.db
        .insert(offer)
        .values({
          userId: ctx.businessOwnerId,
          businessId: ctx.businessId,
          ...input,
        })
        .returning();
      return newOffer;
    }),

  update: businessScopedProcedure
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
        comboProductAId: z.string().nullable().optional(),
        comboProductBId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertValidCombo(ctx.db, ctx.businessId, input.comboProductAId, input.comboProductBId);
      const { id, ...data } = input;
      const [updatedOffer] = await ctx.db
        .update(offer)
        .set(data)
        .where(and(eq(offer.id, id), eq(offer.businessId, ctx.businessId)))
        .returning();
      return updatedOffer;
    }),

  delete: businessScopedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [deletedOffer] = await ctx.db
        .delete(offer)
        .where(and(eq(offer.id, input.id), eq(offer.businessId, ctx.businessId)))
        .returning();
      return deletedOffer;
    }),
} satisfies TRPCRouterRecord;
