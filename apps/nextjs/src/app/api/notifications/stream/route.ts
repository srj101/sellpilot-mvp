import { NextRequest, NextResponse } from "next/server";

import { and, desc, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { notification, businessMember, business } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { subscribe } from "~/lib/notification-broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUnreadCount(businessId: string): Promise<number> {
  const rows = await db
    .select({ id: notification.id })
    .from(notification)
    .where(and(eq(notification.businessId, businessId), eq(notification.read, false)));
  return rows.length;
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

  const customStream = new ReadableStream({
    async start(controller) {
      // Initial snapshot so the badge is correct immediately on connect, before any
      // new notification has fired.
      const unreadCount = await getUnreadCount(businessId);
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ kind: "unread-count", unreadCount })}\n\n`),
      );

      const unsubscribe = subscribe(businessId, (notif) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ kind: "notification", notification: notif })}\n\n`),
          );
        } catch (e) {
          console.warn("SSE stream enqueue failed, subscriber may have disconnected", e);
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
