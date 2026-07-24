import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq, ilike } from "@acme/db";
import { member, organization } from "@acme/db/schema";

import { ownerOnlyProcedure, protectedProcedure, storeProcedure } from "../trpc";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `store-${Date.now().toString(36)}`
  );
}

async function uniqueSlugFor(ctx: { db: typeof import("@acme/db/client").db }, name: string) {
  const base = slugify(name);
  let candidate = base;
  let n = 1;
  // Name uniqueness is already enforced separately, so a collision here only happens when
  // two different names slugify to the same string (e.g. "Test!" and "Test?") — rare, so a
  // small numeric suffix is enough rather than always appending noise like a timestamp.
  while (true) {
    const [existing] = await ctx.db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

export const orgRouter = {
  /** Case-insensitive uniqueness check used while typing the store name. */
  verifyName: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: organization.id })
        .from(organization)
        .where(ilike(organization.name, input.name.trim()))
        .limit(1);
      return { isAvailable: !existing };
    }),

  /** Onboarding: create the caller's first (or an additional) store, and make it active. */
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const name = input.name.trim();

      const [existing] = await ctx.db
        .select({ id: organization.id })
        .from(organization)
        .where(ilike(organization.name, name))
        .limit(1);
      if (existing) {
        throw new Error(`A store named "${name}" already exists — try a different name.`);
      }

      const slug = await uniqueSlugFor(ctx, name);

      const created = await ctx.authApi.createOrganization({
        body: {
          name,
          slug,
          metadata: input.description ? { description: input.description } : undefined,
        },
        headers: ctx.headers,
      });

      const organizationId: string | undefined = created?.id ?? created?.organization?.id;
      if (!organizationId) throw new Error("Failed to create store");

      await ctx.authApi.setActiveOrganization({ body: { organizationId }, headers: ctx.headers });

      return { organizationId, name, slug };
    }),

  /** Every store the caller belongs to (owned or invited into), for the store-switcher page. */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const activeOrganizationId = (ctx.session.session as { activeOrganizationId?: string | null }).activeOrganizationId;

    const rows = await ctx.db
      .select({
        organizationId: member.organizationId,
        role: member.role,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        createdAt: organization.createdAt,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, userId));

    return rows.map((r) => ({ ...r, isActive: r.organizationId === activeOrganizationId }));
  }),

  setActive: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.authApi.setActiveOrganization({ body: { organizationId: input.organizationId }, headers: ctx.headers });
      return { success: true };
    }),

  /**
   * Called from [storeSlug]/layout.tsx on every store-scoped page load: resolves the store
   * by its URL slug, verifies the caller is actually a member (never trust the URL alone),
   * and syncs it as the active org if it wasn't already — so the URL is authoritative, not
   * just cosmetic.
   */
  enterBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [org] = await ctx.db
        .select({ id: organization.id, name: organization.name })
        .from(organization)
        .where(eq(organization.slug, input.slug))
        .limit(1);
      if (!org) return { ok: false as const, reason: "not_found" as const };

      const [membership] = await ctx.db
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.organizationId, org.id), eq(member.userId, ctx.session.user.id)))
        .limit(1);
      if (!membership) return { ok: false as const, reason: "forbidden" as const };

      const activeOrganizationId = (ctx.session.session as { activeOrganizationId?: string | null }).activeOrganizationId;
      if (activeOrganizationId !== org.id) {
        await ctx.authApi.setActiveOrganization({ body: { organizationId: org.id }, headers: ctx.headers });
      }

      return { ok: true as const, name: org.name };
    }),

  /**
   * Permanently delete the caller's store and all data inside it.
   * Only the store owner can do this — ownerOnlyProcedure enforces it.
   * All child rows (members, integrations, products, orders, …) are removed
   * by the ON DELETE CASCADE constraints on their organizationId foreign keys.
   */
  delete: ownerOnlyProcedure.mutation(async ({ ctx }) => {
    await ctx.authApi.deleteOrganization({
      body: { organizationId: ctx.organizationId },
      headers: ctx.headers,
    });
    return { success: true };
  }),

  current: storeProcedure.query(async ({ ctx }) => {
    const [org] = await ctx.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        metadata: organization.metadata,
      })
      .from(organization)
      .where(eq(organization.id, ctx.organizationId))
      .limit(1);
    if (!org) throw new Error("Store not found");
    return org;
  }),

  update: ownerOnlyProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        logo: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(organization)
        .set({
          name: input.name.trim(),
          logo: input.logo || null,
          metadata: input.description?.trim() || null,
        })
        .where(eq(organization.id, ctx.organizationId));
      return { success: true };
    }),

  getUploadUrl: ownerOnlyProcedure
    .input(z.object({ contentType: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const ext = input.contentType.split("/")[1] ?? "jpg";
      const key = `store-logos/${ctx.organizationId}/logo-${Date.now()}.${ext}`;
      
      const { getPresignedUploadUrl, getPublicUrl } = await import("../lib/s3");
      const uploadUrl = await getPresignedUploadUrl(key, input.contentType);
      const publicUrl = getPublicUrl(key);
      
      return { uploadUrl, publicUrl, key };
    }),
} satisfies TRPCRouterRecord;
