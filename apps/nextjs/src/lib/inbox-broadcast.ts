import { and, desc, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { metaWebhookEvent } from "@acme/db/schema";

type InboxUpdate = {
  unreadCount: number;
  latestEventId: string | null;
};

type Subscriber = (data: InboxUpdate) => void;

const subscribers = new Map<string, Set<Subscriber>>();

export function subscribe(organizationId: string, callback: Subscriber): () => void {
  if (!subscribers.has(organizationId)) {
    subscribers.set(organizationId, new Set());
  }
  const subs = subscribers.get(organizationId)!;
  subs.add(callback);

  return () => {
    subs.delete(callback);
    if (subs.size === 0) {
      subscribers.delete(organizationId);
    }
  };
}

export function broadcast(organizationId: string, data: InboxUpdate): void {
  const subs = subscribers.get(organizationId);
  if (!subs || subs.size === 0) return;

  for (const callback of subs) {
    try {
      callback(data);
    } catch {
      // subscriber errored
    }
  }
}

export async function triggerInboxBroadcast(organizationId: string): Promise<void> {
  try {
    const [unreadEvents, latestEvent] = await Promise.all([
      db
        .select({
          id: metaWebhookEvent.id,
          receivedAt: metaWebhookEvent.receivedAt,
        })
        .from(metaWebhookEvent)
        .where(
          and(
            eq(metaWebhookEvent.organizationId, organizationId),
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
            eq(metaWebhookEvent.organizationId, organizationId),
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
    broadcast(organizationId, {
      unreadCount: unreadEvents.length,
      latestEventId,
    });
  } catch (err) {
    console.error("Failed to trigger inbox broadcast:", err);
  }
}

export function getSubscriberCount(organizationId: string): number {
  return subscribers.get(organizationId)?.size ?? 0;
}
