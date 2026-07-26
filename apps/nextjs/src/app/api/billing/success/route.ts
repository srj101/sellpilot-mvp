import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "~/env";
import { createCaller } from "~/trpc/caller";
import { formField } from "../_lib";

export const runtime = "nodejs";

/**
 * Browser redirect after SaaS billing checkout — cosmetic only. The IPN (route.ts under
 * ../ipn) already activated the plan by the time this fires; this just sends the owner
 * somewhere sensible and re-derives status from the DB, never from URL params (billing
 * plan E2).
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const tranId = formField(form, "tran_id");
  const valId = formField(form, "val_id");

  let businessSlug: string | undefined;
  let invoiceId: string | undefined;

  if (tranId && valId) {
    const caller = await createCaller(req.headers);
    const result = await caller.subscription.markInvoicePaid({ tranId, valId });
    businessSlug = result.businessSlug;
    if ("invoiceId" in result) invoiceId = result.invoiceId;
  }

  const redirectUrl = businessSlug
    ? new URL(`/${businessSlug}/dashboard/billing/success${invoiceId ? `?invoice=${invoiceId}` : ""}`, env.APP_URL)
    : new URL("/dashboard", env.APP_URL);
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
