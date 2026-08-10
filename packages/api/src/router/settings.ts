import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq } from "@acme/db";
import { faq, policy, shippingRate } from "@acme/db/schema";

import { enqueueActivityLog } from "../lib/activity-queue";
import { ownerOnlyProcedure, permissionProcedure } from "../trpc";

export const settingsRouter = {
  /**
   * Unlike agent.listPolicies (active-only, for the AI's runtime use), this
   * returns every policy — the settings page needs to manage inactive ones too.
   */
  listAllPolicies: permissionProcedure("settings", "view").query(({ ctx }) => {
    return ctx.db.query.policy.findMany({
      where: eq(policy.businessId, ctx.businessId),
      orderBy: desc(policy.createdAt),
    });
  }),

  /* ─── Shipping rates ─────────────────────────────────────────────── */

  createShippingRate: ownerOnlyProcedure
    .input(
      z.object({
        district: z.string().min(1).max(120),
        cost: z.number().int().min(0),
        estimatedDays: z.number().int().min(0).optional(),
        active: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: shippingRate.id })
        .from(shippingRate)
        .where(
          and(
            eq(shippingRate.businessId, ctx.businessId),
            eq(shippingRate.district, input.district.trim()),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A shipping rate for "${input.district.trim()}" already exists.`,
        });
      }

      const [row] = await ctx.db
        .insert(shippingRate)
        .values({
          businessId: ctx.businessId,
          district: input.district.trim(),
          cost: input.cost,
          estimatedDays: input.estimatedDays,
          active: input.active,
        })
        .returning();

      if (row) {
        await enqueueActivityLog({
          businessId: ctx.businessId,
          actorUserId: ctx.session.user.id,
          actorName: ctx.session.user.name ?? "Store Owner",
          actorType: "staff",
          action: "settings.create_shipping_rate",
          entityType: "shipping_rate",
          entityId: row.id,
          summary: `Created shipping rate for ${row.district} (৳${row.cost})`,
        });
      }

      return row;
    }),

  deleteShippingRate: ownerOnlyProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .delete(shippingRate)
        .where(
          and(eq(shippingRate.id, input.id), eq(shippingRate.businessId, ctx.businessId)),
        )
        .returning({ id: shippingRate.id, district: shippingRate.district });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Shipping rate not found." });
      }

      await enqueueActivityLog({
        businessId: ctx.businessId,
        actorUserId: ctx.session.user.id,
        actorName: ctx.session.user.name ?? "Store Owner",
        actorType: "staff",
        action: "settings.delete_shipping_rate",
        entityType: "shipping_rate",
        entityId: row.id,
        summary: `Deleted shipping rate for ${row.district}`,
      });

      return row;
    }),

  /* ─── FAQs ───────────────────────────────────────────────────────── */

  createFaq: ownerOnlyProcedure
    .input(
      z.object({
        question: z.string().min(1).max(300),
        answer: z.string().min(1),
        tags: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(faq)
        .values({
          businessId: ctx.businessId,
          question: input.question.trim(),
          answer: input.answer.trim(),
          tags: input.tags.map((t) => t.trim()).filter(Boolean),
        })
        .returning();

      if (row) {
        await enqueueActivityLog({
          businessId: ctx.businessId,
          actorUserId: ctx.session.user.id,
          actorName: ctx.session.user.name ?? "Store Owner",
          actorType: "staff",
          action: "settings.create_faq",
          entityType: "faq",
          entityId: row.id,
          summary: `Created FAQ: ${row.question}`,
        });
      }

      return row;
    }),

  deleteFaq: ownerOnlyProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .delete(faq)
        .where(and(eq(faq.id, input.id), eq(faq.businessId, ctx.businessId)))
        .returning({ id: faq.id, question: faq.question });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "FAQ not found." });
      }

      await enqueueActivityLog({
        businessId: ctx.businessId,
        actorUserId: ctx.session.user.id,
        actorName: ctx.session.user.name ?? "Store Owner",
        actorType: "staff",
        action: "settings.delete_faq",
        entityType: "faq",
        entityId: row.id,
        summary: `Deleted FAQ: ${row.question}`,
      });

      return row;
    }),

  /* ─── Policies ───────────────────────────────────────────────────── */

  createPolicy: ownerOnlyProcedure
    .input(
      z.object({
        type: z.enum(["shipping", "return", "warranty", "privacy", "terms"]),
        title: z.string().min(1).max(200),
        body: z.string().min(1),
        active: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: policy.id })
        .from(policy)
        .where(
          and(
            eq(policy.businessId, ctx.businessId),
            eq(policy.type, input.type),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A "${input.type}" policy already exists. Edit it instead.`,
        });
      }

      const [row] = await ctx.db
        .insert(policy)
        .values({
          businessId: ctx.businessId,
          type: input.type,
          title: input.title.trim(),
          body: input.body.trim(),
          active: input.active,
        })
        .returning();

      if (row) {
        await enqueueActivityLog({
          businessId: ctx.businessId,
          actorUserId: ctx.session.user.id,
          actorName: ctx.session.user.name ?? "Store Owner",
          actorType: "staff",
          action: "settings.create_policy",
          entityType: "policy",
          entityId: row.id,
          summary: `Created ${row.type} policy "${row.title}"`,
        });
      }

      return row;
    }),

  deletePolicy: ownerOnlyProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .delete(policy)
        .where(and(eq(policy.id, input.id), eq(policy.businessId, ctx.businessId)))
        .returning({ id: policy.id, title: policy.title, type: policy.type });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Policy not found." });
      }

      await enqueueActivityLog({
        businessId: ctx.businessId,
        actorUserId: ctx.session.user.id,
        actorName: ctx.session.user.name ?? "Store Owner",
        actorType: "staff",
        action: "settings.delete_policy",
        entityType: "policy",
        entityId: row.id,
        summary: `Deleted ${row.type} policy "${row.title}"`,
      });

      return row;
    }),
} satisfies TRPCRouterRecord;
