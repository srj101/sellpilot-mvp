import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "~/env";
import { createCaller } from "~/trpc/caller";
import { formField } from "../_lib";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const tranId = formField(form, "tran_id");
  const valId = formField(form, "val_id");

  if (tranId && valId) {
    const caller = await createCaller(req.headers);
    await caller.checkout.markOrderPaid({ tranId, valId });
  }

  const redirectUrl = new URL(`/pay/${tranId ?? ""}`, env.APP_URL);
  redirectUrl.searchParams.set("status", "success");
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
