import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { desc } from "@acme/db";
import { user } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

/**
 * Platform-wide user management — every account on this SellPilot instance (all
 * merchants, plus any admin/super_admin staff), not to be confused with roles.ts's
 * per-store team members (an org's invited teammates). Restricted to admin/super_admin
 * since it exposes other merchants' account info.
 */
function assertPlatformAdmin(ctx: { session: { user: { role?: string | null } } }) {
  const platformRole = ctx.session.user.role;
  if (platformRole !== "admin" && platformRole !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only SellPilot staff can manage platform users." });
  }
}

export const usersRouter = {
  list: protectedProcedure.query(async ({ ctx }) => {
    assertPlatformAdmin(ctx);
    const rows = await ctx.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt));
    return rows;
  }),

  setRole: protectedProcedure
    .input(z.object({ userId: z.string(), role: z.enum(["client", "admin", "super_admin"]) }))
    .mutation(async ({ ctx, input }) => {
      assertPlatformAdmin(ctx);
      if (ctx.session.user.role !== "super_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only a super admin can change platform roles." });
      }
      await ctx.authApi.setRole({ body: { userId: input.userId, role: input.role }, headers: ctx.headers });
      return { success: true };
    }),

  banUser: protectedProcedure
    .input(z.object({ userId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertPlatformAdmin(ctx);
      await ctx.authApi.banUser({
        body: { userId: input.userId, banReason: input.reason ?? "Banned by admin" },
        headers: ctx.headers,
      });
      return { success: true };
    }),

  unbanUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertPlatformAdmin(ctx);
      await ctx.authApi.unbanUser({ body: { userId: input.userId }, headers: ctx.headers });
      return { success: true };
    }),
} satisfies TRPCRouterRecord;
