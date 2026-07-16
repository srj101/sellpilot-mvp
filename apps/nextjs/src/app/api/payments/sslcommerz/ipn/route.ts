import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createCaller } from "~/trpc/caller";
import { formField } from "../_lib";

export const runtime = "nodejs";

/** Server-to-server callback from SSLCommerz — the authoritative source of truth for payment status. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const tranId = formField(form, "tran_id");
  const valId = formField(form, "val_id");

  if (!tranId || !valId) {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  const caller = await createCaller(req.headers);
  const result = await caller.checkout.markOrderPaid({ tranId, valId });
  return NextResponse.json({ received: result.ok });
}
