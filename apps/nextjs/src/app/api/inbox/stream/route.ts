import { NextRequest, NextResponse } from "next/server";

import { and, desc, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { metaWebhookEvent } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { subscribe } from "~/lib/inbox-broadcast";

export const runtime = "nodejs";

// Helper to query current unread details and most recent thread event
async function getUnreadDetails(userId: string) {
  const [unreadEvents, latestEvent] = await Promise.all([
    db
      .select({
        id: metaWebhookEvent.id,
        receivedAt: metaWebhookEvent.receivedAt,
      })
      .from(metaWebhookEvent)
      .where(
        and(
          eq(metaWebhookEvent.userId, userId),
          eq(metaWebhookEvent.isRead, false),
          inArray(metaWebhookEvent.eventType, [
            "message",
            "messages",
            "postback",
            "quick_reply",
          ]),
        ),
      )
      .orderBy(metaWebhookEvent.receivedAt),
    db
      .select({ id: metaWebhookEvent.id })
      .from(metaWebhookEvent)
      .where(
        and(
          eq(metaWebhookEvent.userId, userId),
          inArray(metaWebhookEvent.eventType, [
            "message",
            "messages",
            "postback",
            "quick_reply",
            "outbound",
          ]),
        ),
      )
      .orderBy(desc(metaWebhookEvent.receivedAt))
      .limit(1),
  ]);

  const latestEventId = latestEvent[0]?.id ?? null;
  return {
    unreadCount: unreadEvents.length,
    latestEventId,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const encoder = new TextEncoder();

  // Create stream
  const customStream = new ReadableStream({
    async start(controller) {
      // Send initial data immediately
      const initialData = await getUnreadDetails(userId);
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`),
      );

      // Subscribe to real-time events
      const unsubscribe = subscribe(userId, (data) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch (e) {
          console.warn(
            "SSE stream enqueue failed, subscriber may have disconnected",
            e,
          );
        }
      });

      // Handle abort / close
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        try {
          controller.close();
        } catch (e) {
          console.warn("SSE stream close failed", e);
        }
      });
    },
  });

  return new NextResponse(customStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
