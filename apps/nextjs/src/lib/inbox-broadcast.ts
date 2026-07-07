import { and, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { metaWebhookEvent } from "@acme/db/schema";

type InboxUpdate = {
  unreadCount: number;
  latestEventId: string | null;
};

type Subscriber = (data: InboxUpdate) => void;

const subscribers = new Map<string, Set<Subscriber>>();

export function subscribe(userId: string, callback: Subscriber): () => void {
  if (!subscribers.has(userId)) {
    subscribers.set(userId, new Set());
  }
  const subs = subscribers.get(userId)!;
  subs.add(callback);

  return () => {
    subs.delete(callback);
    if (subs.size === 0) {
      subscribers.delete(userId);
    }
  };
}

export function broadcast(userId: string, data: InboxUpdate): void {
  const subs = subscribers.get(userId);
  if (!subs || subs.size === 0) return;

  for (const callback of subs) {
    try {
      callback(data);
    } catch {
      // subscriber errored
    }
  }
}

export async function triggerInboxBroadcast(userId: string): Promise<void> {
  try {
    const unreadEvents = await db
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
      .orderBy(metaWebhookEvent.receivedAt);

    const latestEventId = unreadEvents[unreadEvents.length - 1]?.id ?? null;
    broadcast(userId, {
      unreadCount: unreadEvents.length,
      latestEventId,
    });
  } catch (err) {
    console.error("Failed to trigger inbox broadcast:", err);
  }
}

export function getSubscriberCount(userId: string): number {
  return subscribers.get(userId)?.size ?? 0;
}
