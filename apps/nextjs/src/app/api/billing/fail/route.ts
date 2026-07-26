import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "~/env";
import { createCaller } from "~/trpc/caller";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // No payment succeeded — just resolve the owner's own business slug from their session
  // (the browser carries their cookies on this redirect) to send them back to Billing.
  const caller = await createCaller(req.headers);
  const current = await caller.subscription.getCurrent().catch(() => null);

  const redirectUrl = current?.businessSlug
    ? new URL(`/${current.businessSlug}/dashboard/billing?status=fail`, env.APP_URL)
    : new URL("/dashboard", env.APP_URL);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
