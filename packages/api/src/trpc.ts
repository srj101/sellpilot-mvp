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
import { member, organization } from "@acme/db/schema";

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
 * packages/auth's `organization` plugin), an invited member logs in with *their own*
 * user id, which must still resolve to the *owner's* store for every query, or they'd
 * see an empty account.
 *
 * Resolution is authoritative from the URL, not from session state: every request under
 * /{storeSlug}/dashboard/* carries an `x-store-slug` header (injected by middleware.ts
 * for server-rendered pages, and by trpc/react.tsx's link for client-fetched queries —
 * both derive it fresh from the current URL every time). That header is looked up
 * directly against real membership rows here. This deliberately does NOT trust
 * `session.activeOrganizationId` as the primary source — it's a side-effect field
 * (see org.setActive) that a page might navigate away from before it's re-read, and
 * trusting it caused one store's data to render under another store's URL. It's kept
 * only as a fallback for the handful of routes with no store in the URL at all
 * (/onboarding/select-store, the bare /dashboard redirector).
 */
export const orgProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const userId = ctx.session.user.id;
  const requestedSlug = ctx.headers.get("x-store-slug");

  const memberships = await ctx.db
    .select({ organizationId: member.organizationId, role: member.role, customRoleKey: member.customRoleKey })
    .from(member)
    .where(eq(member.userId, userId));

  let membership: (typeof memberships)[number] | undefined;

  if (requestedSlug) {
    const [org] = await ctx.db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, requestedSlug))
      .limit(1);
    membership = org ? memberships.find((m) => m.organizationId === org.id) : undefined;
    if (!membership) {
      // The URL names a real store, but this caller isn't a member of it — fail loudly
      // rather than silently falling back to a *different* store's data.
      throw new TRPCError({ code: "FORBIDDEN", message: "You don't have access to this store." });
    }
  } else {
    const activeOrganizationId = (ctx.session.session as { activeOrganizationId?: string | null }).activeOrganizationId;
    membership =
      (activeOrganizationId ? memberships.find((m) => m.organizationId === activeOrganizationId) : undefined) ??
      memberships[0];
  }

  let storeOwnerId = userId;
  let memberRole = "owner";
  let customRoleKey: string | null = null;
  let organizationId: string | null = null;

  if (membership) {
    organizationId = membership.organizationId;
    memberRole = membership.role;
    customRoleKey = membership.customRoleKey;
    if (membership.role !== "owner") {
      const [owner] = await ctx.db
        .select({ userId: member.userId })
        .from(member)
        .where(and(eq(member.organizationId, membership.organizationId), eq(member.role, "owner")))
        .limit(1);
      storeOwnerId = owner?.userId ?? userId;
    }
  }

  return next({
    ctx: { ...ctx, storeOwnerId, memberRole, customRoleKey, organizationId },
  });
});

/**
 * Store-scoped procedure — for every business-data router (products, orders, customers,
 * inbox, integrations, ...). Every table these touch is keyed by `organizationId`, not
 * `userId` — a single platform user can own more than one store, and `userId` alone can't
 * tell them apart (see orgProcedure's doc comment above). This narrows `ctx.organizationId`
 * from `string | null` to `string`, since every route that reaches these routers is always
 * under /{storeSlug}/dashboard/*, so orgProcedure has already resolved a real store or
 * thrown FORBIDDEN. Routes that can legitimately run with no store yet (invites, the store
 * picker) stay on the plain `orgProcedure`.
 */
export const storeProcedure = orgProcedure.use(({ ctx, next }) => {
  if (!ctx.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No active store selected." });
  }
  return next({ ctx: { ...ctx, organizationId: ctx.organizationId } });
});
