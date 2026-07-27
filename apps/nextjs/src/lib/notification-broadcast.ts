/**
 * Live fan-out for the in-app notification bell — mirrors inbox-broadcast.ts's shape
 * (local subscriber map + SSE), but with one addition: a notification can be created
 * from apps/worker (the AI creating an order, the abandoned-follow-up sweep), not just
 * apps/nextjs (checkout, manual order creation). Only this process holds the live SSE
 * connections to browsers, so a worker-originated event needs Redis pub/sub to actually
 * reach them — plain in-memory fan-out alone only covers events that happen to occur
 * inside this same Next.js process.
 */
import { createNotificationBroadcast, type NotificationBroadcast } from "@acme/queue";

export interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

type Subscriber = (data: NotificationPayload) => void;

const localSubscribers = new Map<string, Set<Subscriber>>();

// Created lazily (not at module load) so this only opens Redis connections once
// something actually subscribes or publishes — e.g. during local dev without Redis
// running, importing this file doesn't immediately fail.
let redisBroadcast: NotificationBroadcast | null = null;
function getRedisBroadcast(): NotificationBroadcast {
  if (!redisBroadcast) {
    redisBroadcast = createNotificationBroadcast();
    redisBroadcast.onNotification(({ businessId, notification }) => {
      const subs = localSubscribers.get(businessId);
      if (!subs || subs.size === 0) return;
      for (const callback of subs) {
        try {
          callback(notification);
        } catch (err) {
          console.error("[notification-broadcast] Local subscriber threw:", err);
        }
      }
    });
  }
  return redisBroadcast;
}

/** Called by the SSE route when a browser connects. Publishing happens centrally in
 * @acme/db's createNotification (called from both apps/nextjs and apps/worker) — this
 * side only ever needs to subscribe and relay to connected browsers. */
export function subscribe(businessId: string, callback: Subscriber): () => void {
  getRedisBroadcast(); // ensure the Redis subscription (cross-process delivery) is live
  if (!localSubscribers.has(businessId)) {
    localSubscribers.set(businessId, new Set());
  }
  const subs = localSubscribers.get(businessId)!;
  subs.add(callback);

  return () => {
    subs.delete(callback);
    if (subs.size === 0) {
      localSubscribers.delete(businessId);
    }
  };
}
