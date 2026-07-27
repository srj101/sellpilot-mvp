/**
 * Cross-process "cancel this thread's in-flight reply" broadcast.
 *
 * Built on the same Redis connection details as RedisQueueProvider
 * (providers/redis.ts), but pub/sub needs its own dedicated connection — once a
 * client calls .subscribe(), ioredis puts it in subscriber mode and it can no
 * longer issue other commands, so publish and subscribe each get their own client.
 */
import { Redis } from "ioredis";

const CHANNEL = "thread-cancel";

export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
}

/** Same env-var fallback RedisQueueProvider's constructor uses, factored out so
 * both places resolve connection details identically. */
export function resolveRedisConnection(
  override?: RedisConnectionOptions
): RedisConnectionOptions {
  return (
    override ?? {
      host: process.env.REDIS_HOST ?? "localhost",
      port: parseInt(process.env.REDIS_PORT ?? "6379"),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB ?? "0"),
    }
  );
}

interface CancelMessage {
  key: string;
  cancelId: string;
}

export class ThreadCancelBroadcast {
  private publisher: Redis;
  private subscriber: Redis;
  private handlers = new Set<(key: string, cancelId: string) => void>();

  constructor(connection: RedisConnectionOptions) {
    const opts = {
      host: connection.host,
      port: connection.port,
      password: connection.password,
      db: connection.db,
      ...(connection.tls ? { tls: {} } : {}),
    };

    this.publisher = new Redis(opts);
    this.subscriber = new Redis(opts);

    this.publisher.on("error", (err) => {
      console.error("[ThreadCancelBroadcast] Publisher error:", err.message);
    });
    this.subscriber.on("error", (err) => {
      console.error("[ThreadCancelBroadcast] Subscriber error:", err.message);
    });

    this.subscriber.subscribe(CHANNEL).catch((err) => {
      console.error("[ThreadCancelBroadcast] Failed to subscribe:", err.message);
    });

    this.subscriber.on("message", (channel, raw) => {
      if (channel !== CHANNEL) return;
      let msg: CancelMessage;
      try {
        msg = JSON.parse(raw) as CancelMessage;
      } catch {
        return;
      }
      for (const handler of this.handlers) {
        try {
          handler(msg.key, msg.cancelId);
        } catch (err) {
          console.error("[ThreadCancelBroadcast] Handler threw:", err);
        }
      }
    });
  }

  /**
   * Tell every worker process (including this one) to cancel a specific
   * in-flight controller for this key, identified by cancelId — NOT "whatever is
   * currently running for this key". Pub/sub delivery is asynchronous, so by the
   * time this message round-trips back (including to the very process that sent
   * it), a newer job may have already replaced the map entry for this key.
   * Matching by the exact id of the controller being superseded means a stale,
   * delayed message can never abort a newer one that happens to share the key.
   */
  async publishCancel(key: string, cancelId: string): Promise<void> {
    try {
      await this.publisher.publish(CHANNEL, JSON.stringify({ key, cancelId } satisfies CancelMessage));
    } catch (err) {
      console.error("[ThreadCancelBroadcast] Failed to publish:", err);
    }
  }

  /** Register a handler invoked whenever any process (including this one)
   * publishes a cancel for some key + controller id. */
  onCancel(handler: (key: string, cancelId: string) => void): void {
    this.handlers.add(handler);
  }

  async close(): Promise<void> {
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
  }
}

export function createThreadCancelBroadcast(
  connection?: RedisConnectionOptions
): ThreadCancelBroadcast {
  return new ThreadCancelBroadcast(resolveRedisConnection(connection));
}

/**
 * Cross-process "a new notification was created" broadcast — a business's in-app
 * notifications (new order, payment received, abandoned follow-up sent, ...) can be
 * created from either apps/nextjs (customer checkout, manual order creation) or
 * apps/worker (the AI creating an order, the follow-up sweep), but only apps/nextjs
 * holds the live SSE connections to browsers. Redis pub/sub is what lets a
 * worker-originated event actually reach a browser in real time instead of only
 * showing up after a page reload.
 */
const NOTIFICATION_CHANNEL = "notification-created";

export interface NotificationMessage {
  businessId: string;
  notification: {
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    read: boolean;
    createdAt: string;
  };
}

export class NotificationBroadcast {
  private publisher: Redis;
  private subscriber: Redis;
  private handlers = new Set<(msg: NotificationMessage) => void>();

  constructor(connection: RedisConnectionOptions) {
    const opts = {
      host: connection.host,
      port: connection.port,
      password: connection.password,
      db: connection.db,
      ...(connection.tls ? { tls: {} } : {}),
    };

    this.publisher = new Redis(opts);
    this.subscriber = new Redis(opts);

    this.publisher.on("error", (err) => {
      console.error("[NotificationBroadcast] Publisher error:", err.message);
    });
    this.subscriber.on("error", (err) => {
      console.error("[NotificationBroadcast] Subscriber error:", err.message);
    });

    this.subscriber.subscribe(NOTIFICATION_CHANNEL).catch((err) => {
      console.error("[NotificationBroadcast] Failed to subscribe:", err.message);
    });

    this.subscriber.on("message", (channel, raw) => {
      if (channel !== NOTIFICATION_CHANNEL) return;
      let msg: NotificationMessage;
      try {
        msg = JSON.parse(raw) as NotificationMessage;
      } catch {
        return;
      }
      for (const handler of this.handlers) {
        try {
          handler(msg);
        } catch (err) {
          console.error("[NotificationBroadcast] Handler threw:", err);
        }
      }
    });
  }

  async publish(msg: NotificationMessage): Promise<void> {
    try {
      await this.publisher.publish(NOTIFICATION_CHANNEL, JSON.stringify(msg));
    } catch (err) {
      console.error("[NotificationBroadcast] Failed to publish:", err);
    }
  }

  onNotification(handler: (msg: NotificationMessage) => void): void {
    this.handlers.add(handler);
  }

  async close(): Promise<void> {
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]);
  }
}

export function createNotificationBroadcast(
  connection?: RedisConnectionOptions
): NotificationBroadcast {
  return new NotificationBroadcast(resolveRedisConnection(connection));
}

// Publish-only path for callers that only ever create notifications (packages/db's
// createNotification, called from both apps/nextjs and apps/worker) and have no reason
// to hold a subscriber connection open — the full NotificationBroadcast class above is
// for apps/nextjs's SSE route specifically, which genuinely needs to subscribe. A
// lazily-created singleton publisher, not a new connection per call.
let sharedPublisher: Redis | null = null;

export async function publishNotificationEvent(
  msg: NotificationMessage,
  connection?: RedisConnectionOptions
): Promise<void> {
  if (!sharedPublisher) {
    const opts = resolveRedisConnection(connection);
    sharedPublisher = new Redis({
      host: opts.host,
      port: opts.port,
      password: opts.password,
      db: opts.db,
      ...(opts.tls ? { tls: {} } : {}),
    });
    sharedPublisher.on("error", (err) => {
      console.error("[publishNotificationEvent] Redis error:", err.message);
    });
  }

  try {
    await sharedPublisher.publish(NOTIFICATION_CHANNEL, JSON.stringify(msg));
  } catch (err) {
    console.error("[publishNotificationEvent] Failed to publish:", err);
  }
}
