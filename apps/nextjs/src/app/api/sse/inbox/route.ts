/**
 * SSE Endpoint for real-time inbox updates
 * Falls back when WebSocket connection fails
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "~/auth/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected", userId })}\n\n`));

      // Subscribe to Redis pub/sub for this user's notifications
      const channel = `notifications:${userId}`;

      // Poll for updates every 5 seconds as fallback
      const interval = setInterval(async () => {
        try {
          // Fetch latest unread count from API
          const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/inbox/unread`, {
            headers: { Cookie: request.headers.get("cookie") ?? "" },
          });
          if (res.ok) {
            const data = await res.json();
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "inbox_update", data })}\n\n`)
            );
          }
        } catch {
          // Ignore polling errors
        }
      }, 5000);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}