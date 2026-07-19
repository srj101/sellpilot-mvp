/**
 * Meta Webhook Handler
 *
 * Handles incoming webhooks from Facebook, Instagram, and WhatsApp.
 * Uses the new queue-based architecture for processing.
 *
 * Flow:
 * 1. Verify signature
 * 2. Parse and normalize webhook payload
 * 3. Store events in database
 * 4. Enqueue jobs for auto-reply processing
 * 5. Return 200 immediately
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { and, desc, eq, or } from "@acme/db";
import { db } from "@acme/db/client";
import { metaConnection, metaWebhookEvent } from "@acme/db/schema";

import { env } from "~/env";
import { triggerInboxBroadcast } from "~/lib/inbox-broadcast";

import {
  MessagingService,
  getPlatformProvider,
  type PlatformType,
  type WebhookEvent,
  type IncomingMessage,
} from "@acme/messaging";
import { createQueue, type MetaDMReplyJob, type MetaCommentReplyJob } from "@acme/queue";

export const runtime = "nodejs";

// Initialize services
const messagingService = new MessagingService({ logging: true });
const queue = createQueue();

console.log("[Webhook] Route module loaded", {
  hasFacebookAppSecret: !!env.FACEBOOK_APP_SECRET,
  hasWebhookVerifyToken: !!env.META_WEBHOOK_VERIFY_TOKEN,
  queueProvider: process.env.QUEUE_PROVIDER ?? "memory",
});

// ============================================
// Webhook Verification (GET)
// ============================================

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (!env.META_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  if (
    mode === "subscribe" &&
    token === env.META_WEBHOOK_VERIFY_TOKEN &&
    challenge
  ) {
    console.log("[Webhook] Subscription verified");
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  console.warn("[Webhook] Verification failed", {
    mode,
    tokenMatches: token === env.META_WEBHOOK_VERIFY_TOKEN,
    hasChallenge: !!challenge,
  });
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ============================================
// Webhook Handler (POST)
// ============================================

export async function POST(req: NextRequest) {
  const signatureHeader = req.headers.get("x-hub-signature-256");

  if (!env.FACEBOOK_APP_SECRET) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  const rawBody = await req.text();
  console.log("[Webhook] Received payload:", rawBody.slice(0, 500));

  // Determine platform from payload
  let platform: PlatformType = "facebook_page";
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed.object === "instagram") {
      platform = "instagram";
    } else if (parsed.object === "whatsapp_business_account") {
      platform = "whatsapp";
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify signature
  const isValid = messagingService.verifyWebhook(
    platform,
    rawBody,
    signatureHeader,
    env.FACEBOOK_APP_SECRET
  );

  if (!isValid) {
    console.warn("[Webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse webhook events
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const headers = Object.fromEntries(req.headers.entries());
  const events = messagingService.parseWebhook(platform, payload, headers);

  if (events.length === 0) {
    console.warn(
      `[Webhook] Payload parsed but yielded 0 events (platform=${platform}) - ` +
        "this is usually a delivery/read receipt or an unsupported event shape"
    );
    return new NextResponse("EVENT_RECEIVED", { status: 200 });
  }

  console.log(`[Webhook] Parsed ${events.length} events`);

  // Process events
  const rows: (typeof metaWebhookEvent.$inferInsert)[] = [];
  const jobsToEnqueue: Array<{
    type: "dm" | "comment";
    event: WebhookEvent;
    connection: typeof metaConnection.$inferSelect;
  }> = [];

  for (const event of events) {
    // Resolve connection
    const connection = await resolveMetaConnection(event.platform, event.accountId);

    if (!connection) {
      console.warn(
        `[Webhook] No connection found for platform=${event.platform} accountId=${event.accountId} - ` +
          "event will be stored as orphaned and no reply will be sent"
      );
    }

    // Prepare database row
    rows.push({
      dedupeKey: event.eventId,
      platform: event.platform,
      object: getObjectType(event.platform),
      eventType: event.eventType,
      metaConnectionId: connection?.id ?? null,
      userId: connection?.userId ?? null,
      platformAccountId: event.accountId,
      sourceId: event.message?.id ?? null,
      threadId: event.message?.threadId ?? null,
      rawPayload: event.rawPayload,
      headers,
      status: connection ? "queued" : "orphaned",
    });

    // Queue jobs for processing
    if (connection?.userId && event.message) {
      if (isInboundMessage(event)) {
        jobsToEnqueue.push({ type: "dm", event, connection });
      } else if (isInboundComment(event)) {
        jobsToEnqueue.push({ type: "comment", event, connection });
      }
    }
  }

  // Insert events to database (with deduplication)
  const inserted = await db
    .insert(metaWebhookEvent)
    .values(rows)
    .onConflictDoNothing()
    .returning();

  const insertedKeys = new Set(inserted.map((r) => r.dedupeKey));

  // Trigger inbox updates for affected users
  const userIds = new Set<string>();
  for (const row of rows) {
    if (row.userId) {
      userIds.add(row.userId);
    }
  }
  for (const userId of userIds) {
    void triggerInboxBroadcast(userId);
  }

  // Enqueue jobs for new events only (not duplicates) - FIRE AND FORGET
  const enqueuePromises = jobsToEnqueue
    .filter(({ event }) => insertedKeys.has(event.eventId))
    .map(async ({ type, event, connection }) => {
      try {
        if (type === "dm" && event.message) {
          const job: MetaDMReplyJob = {
            eventId: event.eventId,
            platform: event.platform as "facebook_page" | "instagram" | "whatsapp",
            connectionId: connection.id,
            userId: connection.userId,
            recipientId: event.message.senderId,
            threadId: event.message.threadId,
            incomingMessage: {
              text: event.message.text ?? `[${event.message.type || "voice"} message]`,
              imageUrls: event.message.attachments
                ?.filter((a) => a.type === "image")
                .map((a) => a.url),
              audioUrls: event.message.attachments
                ?.filter((a) => a.type === "audio")
                .map((a) => a.url),
              timestamp: event.message.timestamp.getTime(),
            },
            accessToken: connection.accessToken ?? connection.facebookPageAccessToken ?? "",
            accountId: getAccountId(event.platform, connection),
          };

          queue.enqueue("meta-dm-reply", job, {
            attempts: 3,
            backoff: { type: "exponential", delay: 2000 },
          }).catch((err) => console.error(`[Webhook] Failed to enqueue DM job: ${event.eventId}`, err));
        } else if (type === "comment" && event.message) {
          const job: MetaCommentReplyJob = {
            eventId: event.eventId,
            platform: event.platform as "facebook_page" | "instagram",
            connectionId: connection.id,
            userId: connection.userId,
            commentId: event.message.id,
            commentText: event.message.text ?? "",
            accessToken: connection.accessToken ?? connection.facebookPageAccessToken ?? "",
          };

          queue.enqueue("meta-comment-reply", job, {
            attempts: 3,
            backoff: { type: "exponential", delay: 2000 },
          }).catch((err) => console.error(`[Webhook] Failed to enqueue comment job: ${event.eventId}`, err));
        }
      } catch (err) {
        console.error(`[Webhook] Failed to enqueue job: ${event.eventId}`, err);
      }
    });

  // Don't await - fire and forget
  void enqueuePromises;

  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}

// ============================================
// Helper Functions
// ============================================

function getObjectType(platform: PlatformType): "page" | "instagram" | "whatsapp_business_account" {
  switch (platform) {
    case "facebook_page":
      return "page";
    case "instagram":
      return "instagram";
    case "whatsapp":
      return "whatsapp_business_account";
    default:
      return "page";
  }
}

function getAccountId(
  platform: PlatformType,
  connection: typeof metaConnection.$inferSelect
): string {
  switch (platform) {
    case "instagram":
      return connection.facebookPageId ?? connection.platformAccountId ?? "";
    case "whatsapp":
      return connection.whatsappPhoneNumberId ?? connection.platformAccountId ?? "";
    default:
      return connection.platformAccountId ?? "";
  }
}

function isInboundMessage(event: WebhookEvent): boolean {
  if (!event.message) return false;

  const validTypes = ["message", "quick_reply", "postback"];
  if (!validTypes.includes(event.eventType)) return false;

  // Skip echo messages
  const raw = event.rawPayload;
  if (event.platform === "facebook_page" || event.platform === "instagram") {
    const entry = Array.isArray(raw.entry) ? raw.entry[0] : null;
    const messaging = entry?.messaging?.[0];
    if (messaging?.message?.is_echo) return false;
  }

  return true;
}

function isInboundComment(event: WebhookEvent): boolean {
  if (event.eventType !== "comment") return false;
  if (!event.message) return false;

  // Skip edits and deletions
  const raw = event.rawPayload;
  const entry = Array.isArray(raw.entry) ? raw.entry[0] : null;
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (value?.verb === "remove" || value?.verb === "edited") return false;

  return true;
}

async function resolveMetaConnection(
  platform: PlatformType,
  accountId: string
): Promise<typeof metaConnection.$inferSelect | null> {
  let rows: (typeof metaConnection.$inferSelect)[] = [];

  switch (platform) {
    case "facebook_page":
      rows = await db
        .select()
        .from(metaConnection)
        .where(
          and(
            eq(metaConnection.platform, "facebook_page"),
            or(
              eq(metaConnection.facebookPageId, accountId),
              eq(metaConnection.platformAccountId, accountId)
            )
          )
        )
        .limit(1);
      break;

    case "instagram":
      rows = await db
        .select()
        .from(metaConnection)
        .where(
          and(
            eq(metaConnection.platform, "instagram"),
            or(
              eq(metaConnection.instagramBusinessAccountId, accountId),
              eq(metaConnection.platformAccountId, accountId)
            )
          )
        )
        .limit(1);
      break;

    case "whatsapp":
      rows = await db
        .select()
        .from(metaConnection)
        .where(
          and(
            eq(metaConnection.platform, "whatsapp"),
            or(
              eq(metaConnection.whatsappPhoneNumberId, accountId),
              eq(metaConnection.platformAccountId, accountId),
              eq(metaConnection.whatsappBusinessAccountId, accountId)
            )
          )
        )
        .limit(1);
      break;
  }

  // Fallback to most recent connection for the platform
  if (rows.length === 0) {
    rows = await db
      .select()
      .from(metaConnection)
      .where(eq(metaConnection.platform, platform))
      .orderBy(desc(metaConnection.connectedAt))
      .limit(1);
  }

  return rows[0] ?? null;
}
