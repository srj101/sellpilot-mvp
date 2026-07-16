import { appRouter, createTRPCContext } from "@acme/api";

import { auth } from "~/auth/server";

/**
 * One-shot server-side tRPC caller — for Server Components and Route Handlers
 * that just need a value once and don't need react-query caching/hydration.
 * Pass the incoming request's headers (from next/headers or a NextRequest).
 */
export async function createCaller(requestHeaders: Headers) {
  const heads = new Headers(requestHeaders);
  heads.set("x-trpc-source", "rsc-caller");
  const ctx = await createTRPCContext({ headers: heads, auth });
  return appRouter.createCaller(ctx);
}
