import { NextResponse } from "next/server";

import { and, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { metaWebhookEvent } from "@acme/db/schema";

import { getSession } from "~/auth/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const unreadEvents = await db
      .select({
        id: metaWebhookEvent.id,
        receivedAt: metaWebhookEvent.receivedAt,
      })
      .from(metaWebhookEvent)
      .where(
        and(
          eq(metaWebhookEvent.userId, session.user.id),
          eq(metaWebhookEvent.isRead, false),
          inArray(metaWebhookEvent.eventType, [
            "message",
            "messages",
            "postback",
            "quick_reply",
          ]),
        ),
      )
      .orderBy(metaWebhookEvent.receivedAt);

    const latestEventId = unreadEvents[unreadEvents.length - 1]?.id ?? null;

    return NextResponse.json({
      unreadCount: unreadEvents.length,
      latestEventId,
    });
  } catch (err) {
    console.error("Failed to poll inbox notifications:", err);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
