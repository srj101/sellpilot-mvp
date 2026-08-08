import { NextRequest, NextResponse } from "next/server";

import { and, desc, eq, inArray, sql } from "@acme/db";
import { db } from "@acme/db/client";
import { metaWebhookEvent, businessMember, business } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { subscribe } from "~/lib/inbox-broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Optimized query - use COUNT and LIMIT 1 instead of fetching all records
async function getUnreadDetails(businessId: string) {
  const [unreadResult, latestResult] = await Promise.all([
    // Count unread messages
    db
      .select({ count: sql<number>`count(*)` })
      .from(metaWebhookEvent)
      .where(
        and(
          eq(metaWebhookEvent.businessId, businessId),
          eq(metaWebhookEvent.isRead, false),
          inArray(metaWebhookEvent.eventType, [
            "message",
            "messages",
            "postback",
            "quick_reply",
          ]),
        ),
      ),
    // Get latest event ID only
    db
      .select({ id: metaWebhookEvent.id })
      .from(metaWebhookEvent)
      .where(
        and(
          eq(metaWebhookEvent.businessId, businessId),
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

  const latestEventId = latestResult[0]?.id ?? null;
  return {
    unreadCount: Number(unreadResult[0]?.count ?? 0),
    latestEventId,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const businessSlug = req.nextUrl.searchParams.get("businessSlug");
  if (!businessSlug) {
    return new Response("Missing businessSlug", { status: 400 });
  }

  const [org] = await db.select({ id: business.id }).from(business).where(eq(business.slug, businessSlug)).limit(1);
  if (!org) {
    return new Response("Store not found", { status: 404 });
  }

  const [membership] = await db
    .select({ id: businessMember.id })
    .from(businessMember)
    .where(and(eq(businessMember.businessId, org.id), eq(businessMember.userId, session.user.id)))
    .limit(1);
  if (!membership) {
    return new Response("Forbidden", { status: 403 });
  }

  const businessId = org.id;
  const encoder = new TextEncoder();

  // Create stream
  const customStream = new ReadableStream({
    async start(controller) {
      // Send initial data immediately
      const initialData = await getUnreadDetails(businessId);
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`),
      );

      // Subscribe to real-time events
      const unsubscribe = subscribe(businessId, (data) => {
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

      // Send a heartbeat comment every 15 s to keep the connection alive through
      // proxies / CDNs that drop idle connections after ~60 s.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`:heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      // Handle abort / close
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
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
