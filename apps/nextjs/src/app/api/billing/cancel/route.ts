import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "~/env";
import { createCaller } from "~/trpc/caller";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const caller = await createCaller(req.headers);
  const current = await caller.subscription.getCurrent().catch(() => null);

  const redirectUrl = current?.businessSlug
    ? new URL(`/${current.businessSlug}/dashboard/billing?status=cancel`, env.APP_URL)
    : new URL("/dashboard", env.APP_URL);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
