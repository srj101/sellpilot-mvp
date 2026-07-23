import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Every /{storeSlug}/dashboard/* request gets the slug injected as an x-store-slug
 * request header, read by both the server tRPC caller (via headers()) and the client
 * tRPC link (via window.location.pathname, see trpc/react.tsx) so that orgProcedure
 * (packages/api/src/trpc.ts) resolves the store from the URL directly on every call —
 * not from session.activeOrganizationId, which is a separately-synced value that can
 * desync from what's actually on screen. The URL is the single source of truth.
 */
export function middleware(request: NextRequest) {
  const match = /^\/([^/]+)\/dashboard(?:\/|$)/.exec(request.nextUrl.pathname);
  if (!match) return NextResponse.next();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-store-slug", match[1]!);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/:storeSlug/dashboard/:path*"],
};
