import { NextResponse } from "next/server";

import { eq } from "@acme/db";
import { db } from "@acme/db/client";
import { businessProfile } from "@acme/db/schema";

import { getSession } from "~/auth/server";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      name: string;
      description?: string;
      currency?: string;
      defaultShippingCost?: number;
      supportEmail?: string;
      supportPhone?: string;
    };
    const {
      name,
      description,
      currency,
      defaultShippingCost,
      supportEmail,
      supportPhone,
    } = body;

    // Check if profile exists
    const existing = await db
      .select()
      .from(businessProfile)
      .where(eq(businessProfile.userId, session.user.id));

    if (existing.length > 0) {
      // Update
      await db
        .update(businessProfile)
        .set({
          name,
          description: description || null,
          currency: currency || "BDT",
          defaultShippingCost: defaultShippingCost ?? 0,
          supportEmail: supportEmail || null,
          supportPhone: supportPhone || null,
          updatedAt: new Date(),
        })
        .where(eq(businessProfile.userId, session.user.id));
    } else {
      // Insert
      await db.insert(businessProfile).values({
        userId: session.user.id,
        name,
        description: description || null,
        currency: currency || "BDT",
        defaultShippingCost: defaultShippingCost ?? 0,
        supportEmail: supportEmail || null,
        supportPhone: supportPhone || null,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update profile settings:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
