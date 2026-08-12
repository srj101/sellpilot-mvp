/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1)
 * 2. You want to create a new middleware or type of procedure (see Part 3)
 *
 * tl;dr - this is where all the tRPC server stuff is created and plugged in.
 * The pieces you will need to use are documented accordingly near the end
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod/v4";

import type { Auth, Session } from "@acme/auth";
import { and, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { businessMember, business } from "@acme/db/schema";

import type { Action, Resource } from "./lib/permissions";
import { resolvePermissions } from "./lib/permissions";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */

export const createTRPCContext = async (opts: {
  headers: Headers;
  auth: Auth;
}): Promise<{
  authApi: any;
  headers: Headers;
  session: Session | null;
  db: typeof db;
}> => {
  const authApi = opts.auth.api;
  const session = await authApi.getSession({
    headers: opts.headers,
  });
  return {
    authApi,
    headers: opts.headers,
    session,
    db,
  };
};
/**
 * 2. INITIALIZATION
 *
 * This is where the trpc api is initialized, connecting the context and
 * transformer
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      zodError:
        error.cause instanceof ZodError
          ? z.flattenError(error.cause as ZodError<Record<string, unknown>>)
          : null,
    },
  }),
});

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these
 * a lot in the /src/server/api/routers folder
 */

/**
 * This is how you create new routers and subrouters in your tRPC API
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an articifial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    // artificial delay in dev 100-500ms
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Public (unauthed) procedure
 *
 * This is the base piece you use to build new queries and mutations on your
 * tRPC API. It does not guarantee that a user querying is authorized, but you
 * can still access user session data if they are logged in
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        // infers the `session` as non-nullable
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });

/**
 * Org-aware procedure — resolves which "store" the caller acts on.
 *
 * Every table in this app is scoped by a userId that represents "the store" (e.g.
 * `order.userId`, `product.userId`). Historically that was always the logged-in user's
 * own id — one login, one store. Once a merchant can invite teammates (see
 * packages/auth's `business` plugin), an invited member logs in with *their own*
 * user id, which must still resolve to the *owner's* store for every query, or they'd
 * see an empty account.
 *
 * Resolution is authoritative from the URL, not from session state: every request under
 * /{storeSlug}/dashboard/* carries an `x-business-slug` header (injected by middleware.ts
 * for server-rendered pages, and by trpc/react.tsx's link for client-fetched queries —
 * both derive it fresh from the current URL every time). That header is looked up
 * directly against real membership rows here. This deliberately does NOT trust
 * `session.activeBusinessId` as the primary source — it's a side-effect field
 * (see org.setActive) that a page might navigate away from before it's re-read, and
 * trusting it caused one store's data to render under another store's URL. It's kept
 * only as a fallback for the handful of routes with no store in the URL at all
 * (/onboarding/select-store, the bare /dashboard redirector).
 */
export const businessProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const userId = ctx.session.user.id;
  const requestedSlug = ctx.headers.get("x-business-slug");

  const memberships = await ctx.db
    .select({ businessId: businessMember.businessId, role: businessMember.role, customRoleKey: businessMember.customRoleKey })
    .from(businessMember)
    .where(eq(businessMember.userId, userId));

  let membership: (typeof memberships)[number] | undefined;

  if (requestedSlug) {
    const [org] = await ctx.db
      .select({ id: business.id })
      .from(business)
      .where(eq(business.slug, requestedSlug))
      .limit(1);
    membership = org ? memberships.find((m) => m.businessId === org.id) : undefined;
    if (!membership) {
      // The URL names a real store, but this caller isn't a member of it — fail loudly
      // rather than silently falling back to a *different* store's data.
      throw new TRPCError({ code: "FORBIDDEN", message: "You don't have access to this business." });
    }
  } else {
    const activeBusinessId = (ctx.session.session as { activeBusinessId?: string | null }).activeBusinessId;
    membership =
      (activeBusinessId ? memberships.find((m) => m.businessId === activeBusinessId) : undefined) ??
      memberships[0];
  }

  let memberRole = "owner";
  let customRoleKey: string | null = null;
  let businessId: string | null = null;

  if (membership) {
    businessId = membership.businessId;
    memberRole = membership.role;
    customRoleKey = membership.customRoleKey;
  }

  // Effective RBAC permissions for this member, resolved once per request so the
  // permission gate below costs nothing. Owners short-circuit to "*" (no extra query);
  // members with no business resolved get an empty set.
  const permissions =
    membership && businessId
      ? memberRole === "owner"
        ? ["*"]
        : await resolvePermissions(ctx.db, { memberRole, customRoleKey, businessId })
      : [];

  return next({
    ctx: { ...ctx, memberRole, customRoleKey, businessId, permissions },
  });
});

/**
 * Store-scoped procedure — for every business-data router (products, orders, customers,
 * inbox, integrations, ...). Every table these touch is keyed by `businessId`, not
 * `userId` — a single platform user can own more than one store, and `userId` alone can't
 * tell them apart (see businessProcedure's doc comment above). This narrows `ctx.businessId`
 * from `string | null` to `string`, since every route that reaches these routers is always
 * under /{storeSlug}/dashboard/*, so businessProcedure has already resolved a real store or
 * thrown FORBIDDEN. Routes that can legitimately run with no store yet (invites, the store
 * picker) stay on the plain `businessProcedure`.
 */
export const businessScopedProcedure = businessProcedure.use(({ ctx, next }) => {
  if (!ctx.businessId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No active business selected." });
  }
  return next({ ctx: { ...ctx, businessId: ctx.businessId } });
});

/**
 * Owner-only procedure — for actions only the business owner can perform:
 * connecting/disconnecting integrations (Meta, WhatsApp, Instagram) and
 * deleting the store itself. Invited members, even with the "admin" custom
 * role, cannot do these.
 */
export const ownerOnlyProcedure = businessScopedProcedure.use(({ ctx, next }) => {
  if (ctx.memberRole !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the business owner can perform this action.",
    });
  }
  return next({ ctx });
});

/**
 * Permission-gated procedure — enforces a `resource:action` RBAC check against the
 * member's resolved permissions (see businessProcedure's `permissions`). Owners pass
 * via "*". Rollout is staged: unless RBAC_ENFORCE=true, a denial is logged with full
 * context and allowed through (log-only mode) so legacy members who'd be locked out
 * (e.g. a NULL customRoleKey) surface in the logs before enforcement flips on.
 */
const RBAC_ENFORCE = process.env.RBAC_ENFORCE === "true";

export const permissionProcedure = (resource: Resource, action: Action) =>
  businessScopedProcedure.use(async ({ ctx, next, path }) => {
    if (ctx.permissions.includes("*") || ctx.permissions.includes(`${resource}:${action}`)) {
      return next({ ctx });
    }

    if (!RBAC_ENFORCE) {
      console.warn(
        `[rbac] would deny ${path} for user ${ctx.session.user.id} business ${ctx.businessId} ` +
          `role=${ctx.memberRole} customRoleKey=${ctx.customRoleKey}: missing ${resource}:${action}`,
      );
      return next({ ctx });
    }

    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Your role doesn't allow you to ${action} ${resource}.`,
    });
  });

/**
 * Like permissionProcedure, but for endpoints that blend data from several resources (e.g.
 * the Overview dashboard mixes orders/products/customers/analytics) — passes if the caller
 * holds ANY one of the listed resource:action pairs, rather than requiring one specific pair.
 * Same staged RBAC_ENFORCE rollout behavior as permissionProcedure.
 */
export const permissionAnyProcedure = (checks: readonly (readonly [Resource, Action])[]) =>
  businessScopedProcedure.use(async ({ ctx, next, path }) => {
    if (ctx.permissions.includes("*") || checks.some(([resource, action]) => ctx.permissions.includes(`${resource}:${action}`))) {
      return next({ ctx });
    }

    const wanted = checks.map(([resource, action]) => `${resource}:${action}`).join(" or ");

    if (!RBAC_ENFORCE) {
      console.warn(
        `[rbac] would deny ${path} for user ${ctx.session.user.id} business ${ctx.businessId} ` +
          `role=${ctx.memberRole} customRoleKey=${ctx.customRoleKey}: missing any of ${wanted}`,
      );
      return next({ ctx });
    }

    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Your role doesn't allow you to view this — it requires one of: ${wanted}.`,
    });
  });

/**
 * Superadmin procedure — for the SellPilot platform owner / developer.
 * Assigned manually via DB: UPDATE \"user\" SET role = 'superadmin' WHERE email = '...';
 * Has no business restrictions — can view any user, any store, enter any dashboard.
 */
export const superadminProcedure = protectedProcedure.use(({ ctx, next }) => {
  const userRole = (ctx.session.user as { role?: string | null }).role;
  if (userRole !== "superadmin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Superadmin access required.",
    });
  }
  return next({ ctx });
});
