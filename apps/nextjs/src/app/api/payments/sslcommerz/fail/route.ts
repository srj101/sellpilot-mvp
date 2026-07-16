import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "~/env";
import { formField } from "../_lib";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const tranId = formField(form, "tran_id");

  const redirectUrl = new URL(`/pay/${tranId ?? ""}`, env.APP_URL);
  redirectUrl.searchParams.set("status", "fail");
  return NextResponse.redirect(redirectUrl, { status: 303 });
}
