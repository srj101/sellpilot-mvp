import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { desc, eq, and } from "@acme/db";
import { role, member, invitation, user, organization } from "@acme/db/schema";

import { orgProcedure, protectedProcedure, publicProcedure, storeProcedure } from "../trpc";

const RESOURCES = [
  "orders",
  "products",
  "customers",
  "invoices",
  "users",
  "inbox",
  "analytics",
  "agent",
  "offers",
  "integrations",
  "settings",
] as const;
const ACTIONS = ["view", "create", "edit", "delete"] as const;

function perms(resources: readonly string[], actions: readonly string[]) {
  return resources.flatMap((r) => actions.map((a) => `${r}:${a}`));
}

/**
 * Default roles returned when a store hasn't created any custom roles yet.
 *
 * - integrations:connect / integrations:disconnect are intentionally absent from
 *   all default roles — those actions are owner-only at the procedure level and
 *   cannot be delegated via a custom role.
 * - integrations:view lets editors/admins see the integrations page without
 *   being able to add or remove connections.
 */
const DEFAULT_ROLES = [
  {
    name: "Admin",
    key: "admin",
    description: "Full access to every resource. Cannot connect/disconnect integrations (owner only).",
    permissions: [
      ...perms(["orders", "products", "customers", "invoices", "users"], ACTIONS),
      ...perms(["inbox", "analytics", "agent", "offers", "settings"], ACTIONS),
      "integrations:view",
    ],
  },
  {
    name: "Editor",
    key: "editor",
    description: "Can view, create, and edit records. Cannot delete or manage users/settings.",
    permissions: [
      ...perms(["orders", "products", "customers", "invoices"], ["view", "create", "edit"]),
      ...perms(["inbox", "offers"], ["view", "create", "edit"]),
      "users:view",
      "analytics:view",
      "agent:view",
      "integrations:view",
    ],
  },
  {
    name: "Viewer",
    key: "viewer",
    description: "Read-only access across the store.",
    permissions: perms(
      ["orders", "products", "customers", "invoices", "users", "inbox", "analytics", "agent", "offers", "integrations", "settings"],
      ["view"],
    ),
  },
];

export const rolesRouter = {
  list: storeProcedure.query(async ({ ctx }) => {
    const roles = await ctx.db
      .select()
      .from(role)
      .where(eq(role.organizationId, ctx.organizationId))
      .orderBy(desc(role.createdAt));

    if (roles.length === 0) {
      return DEFAULT_ROLES.map((r) => ({ ...r, id: r.key }));
    }

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      key: r.key,
      description: r.description ?? "",
      permissions: r.permissions,
    }));
  }),

  create: storeProcedure
    .input(
      z.object({
        name: z.string().min(1),
        key: z.string().min(1).regex(/^[a-z_]+$/),
        description: z.string().optional(),
        permissions: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: role.id })
        .from(role)
        .where(and(eq(role.organizationId, ctx.organizationId), eq(role.key, input.key)))
        .limit(1);

      if (existing.length > 0) {
        throw new Error("Role with this key already exists");
      }

      const [newRole] = await ctx.db
        .insert(role)
        .values({
          userId: ctx.storeOwnerId,
          organizationId: ctx.organizationId,
          name: input.name,
          key: input.key,
          description: input.description,
          permissions: input.permissions,
        })
        .returning();

      return newRole;
    }),

  update: storeProcedure
    .input(
      z.object({
        key: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        permissions: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(role)
        .set({
          name: input.name,
          description: input.description,
          permissions: input.permissions,
        })
        .where(and(eq(role.organizationId, ctx.organizationId), eq(role.key, input.key)))
        .returning();

      return updated ?? null;
    }),

  delete: storeProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(role).where(and(eq(role.organizationId, ctx.organizationId), eq(role.key, input.key)));
      return { success: true };
    }),

  // --- Team members & invitations -------------------------------------------------

  getInvitationDetails: publicProcedure
    .input(z.object({ invitationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          email: invitation.email,
          status: invitation.status,
          role: invitation.customRoleKey,
          expiresAt: invitation.expiresAt,
          organizationName: organization.name,
        })
        .from(invitation)
        .innerJoin(organization, eq(invitation.organizationId, organization.id))
        .where(eq(invitation.id, input.invitationId))
        .limit(1);

      return row ?? null;
    }),

  /**
   * Stays on the plain `orgProcedure` (not `storeProcedure`) because a brand-new account
   * with no store yet is a legitimate state here — it falls back to a self-only view
   * instead of throwing. Once `ctx.organizationId` is set, it's already resolved from the
   * URL (not re-derived from a possibly-ambiguous `member.userId` lookup), so it's correct
   * even for an account that owns more than one store.
   */
  listMembers: orgProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    if (!ctx.organizationId) {
      return {
        organizationId: null as string | null,
        currentUserRole: "owner" as const,
        canManageTeam: true,
        members: [
          {
            id: "self",
            userId,
            name: ctx.session.user.name,
            email: ctx.session.user.email,
            role: "owner",
            customRoleKey: null as string | null,
            isYou: true,
          },
        ],
        invitations: [] as (typeof invitation.$inferSelect)[],
      };
    }

    const orgId = ctx.organizationId;
    const [memberRows, invitationRows] = await Promise.all([
      ctx.db
        .select({
          id: member.id,
          userId: member.userId,
          role: member.role,
          customRoleKey: member.customRoleKey,
          name: user.name,
          email: user.email,
        })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(eq(member.organizationId, orgId)),
      ctx.db
        .select()
        .from(invitation)
        .where(and(eq(invitation.organizationId, orgId), eq(invitation.status, "pending"))),
    ]);

    return {
      organizationId: orgId,
      currentUserRole: ctx.memberRole,
      canManageTeam: ctx.memberRole === "owner" || ctx.customRoleKey === "admin",
      members: memberRows.map((m) => ({ ...m, isYou: m.userId === userId })),
      invitations: invitationRows,
    };
  }),

  /** Stays on `orgProcedure`: the first invite ever sent by an account creates its
   * organization lazily, so "no store yet" is a legitimate state to handle here. */
  inviteMember: orgProcedure
    .input(z.object({ email: z.string().email(), customRoleKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let organizationId = ctx.organizationId;
      let memberRole = ctx.memberRole;
      let customRoleKey = ctx.customRoleKey;

      if (!organizationId) {
        // First invite ever sent by this account — create their organization now (lazy,
        // see orgProcedure's doc comment). They become the owner automatically.
        const userId = ctx.session.user.id;
        await ctx.authApi.createOrganization({
          body: {
            name: `${ctx.session.user.name}'s Store`,
            slug: `store-${userId.slice(0, 10)}-${Date.now().toString(36)}`,
          },
          headers: ctx.headers,
        });
        const [membership] = await ctx.db.select().from(member).where(eq(member.userId, userId)).limit(1);
        if (!membership) throw new Error("Failed to create organization");
        organizationId = membership.organizationId;
        memberRole = membership.role;
        customRoleKey = membership.customRoleKey;
      } else if (memberRole !== "owner" && customRoleKey !== "admin") {
        throw new Error("Only the store owner or an Admin can invite team members");
      }

      await ctx.authApi.createInvitation({
        body: {
          email: input.email,
          role: "member",
          organizationId,
          customRoleKey: input.customRoleKey,
        },
        headers: ctx.headers,
      });

      return { success: true };
    }),

  cancelInvitation: storeProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.memberRole !== "owner" && ctx.customRoleKey !== "admin") {
        throw new Error("Only the store owner or an Admin can manage team members");
      }
      await ctx.authApi.cancelInvitation({ body: { invitationId: input.invitationId }, headers: ctx.headers });
      return { success: true };
    }),

  acceptInvitation: orgProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [inv] = await ctx.db.select().from(invitation).where(eq(invitation.id, input.invitationId)).limit(1);
      if (!inv) throw new Error("Invitation not found or already used");

      await ctx.authApi.acceptInvitation({ body: { invitationId: input.invitationId }, headers: ctx.headers });

      if (inv.customRoleKey) {
        await ctx.db
          .update(member)
          .set({ customRoleKey: inv.customRoleKey })
          .where(and(eq(member.organizationId, inv.organizationId), eq(member.userId, ctx.session.user.id)));
      }

      const [org] = await ctx.db
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, inv.organizationId))
        .limit(1);

      return { success: true, organizationSlug: org?.slug ?? null };
    }),

  /** Pending invitations addressed to the caller's own email — for the in-app store-switcher panel. */
  listMyInvitations: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: invitation.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
        customRoleKey: invitation.customRoleKey,
        expiresAt: invitation.expiresAt,
        organizationName: organization.name,
      })
      .from(invitation)
      .innerJoin(organization, eq(invitation.organizationId, organization.id))
      .where(and(eq(invitation.email, ctx.session.user.email), eq(invitation.status, "pending")));
    return rows;
  }),

  rejectInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.authApi.rejectInvitation({ body: { invitationId: input.invitationId }, headers: ctx.headers });
      return { success: true };
    }),

  updateMemberRole: storeProcedure
    .input(z.object({ memberId: z.string(), customRoleKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.memberRole !== "owner" && ctx.customRoleKey !== "admin") {
        throw new Error("Only the store owner or an Admin can manage team members");
      }
      await ctx.db
        .update(member)
        .set({ customRoleKey: input.customRoleKey })
        .where(and(eq(member.id, input.memberId), eq(member.organizationId, ctx.organizationId)));
      return { success: true };
    }),

  removeMember: storeProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.memberRole !== "owner" && ctx.customRoleKey !== "admin") {
        throw new Error("Only the store owner or an Admin can manage team members");
      }
      await ctx.authApi.removeMember({
        body: { memberIdOrEmail: input.memberId, organizationId: ctx.organizationId },
        headers: ctx.headers,
      });
      return { success: true };
    }),
} satisfies TRPCRouterRecord;
