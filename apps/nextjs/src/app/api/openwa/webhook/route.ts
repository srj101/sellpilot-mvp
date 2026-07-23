/**
 * OpenWA Webhook Handler
 * Handles incoming webhooks from OpenWA (unofficial WhatsApp API)
 * Now uses the new queue-based architecture
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { and, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { metaConnection, metaWebhookEvent } from "@acme/db/schema";

import { env } from "~/env";
import { triggerInboxBroadcast } from "~/lib/inbox-broadcast";
import { createQueue, type MetaDMReplyJob } from "@acme/queue";

export const runtime = "nodejs";

const queue = createQueue();

function verifyOpenWASignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=") || !secret) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const received = Buffer.from(signatureHeader.slice("sha256=".length));
  const actual = Buffer.from(expected);

  if (received.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(received, actual);
}

export async function POST(req: NextRequest) {
  const signatureHeader = req.headers.get("x-openwa-signature");
  const rawBody = await req.text();

  const webhookSecret =
    env.OPENWA_WEBHOOK_SECRET ?? env.META_WEBHOOK_VERIFY_TOKEN;
  if (webhookSecret) {
    if (!verifyOpenWASignature(rawBody, signatureHeader, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn(
      "[OpenWA Webhook] No webhook secret configured; skipping signature verification."
    );
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, sessionId, data } = body;

  console.log(
    "[OpenWA Webhook] Incoming event:",
    event,
    "sessionId:",
    sessionId
  );

  // Accept various event name formats from different OpenWA engines
  const MESSAGE_EVENTS = new Set([
    "message.received",
    "message.sent",
    "message",
    "onMessage",
    "onAnyMessage",
    "messages.upsert",
    "message.any",
  ]);

  if (!MESSAGE_EVENTS.has(event)) {
    console.log("[OpenWA Webhook] Ignoring non-message event:", event);
    return new NextResponse(null, { status: 204 });
  }

  if (!sessionId || !data) {
    return NextResponse.json(
      { error: "Missing sessionId or data" },
      { status: 400 }
    );
  }

  // Derive the store (organizationId) from sessionId — session names are "org-{organizationId}"
  // (see integrations.ts's sessionName helper). The "user-" prefix is legacy: sessions created
  // before the org migration, kept here only so those old sessions don't just stop working.
  let organizationId: string | null = null;
  let connection: any = null;

  if (sessionId.startsWith("org-")) {
    organizationId = sessionId.slice("org-".length);
    if (organizationId) {
      connection = await db.query.metaConnection.findFirst({
        where: and(
          eq(metaConnection.organizationId, organizationId),
          eq(metaConnection.platform, "whatsapp")
        ),
      });
    }
  } else if (sessionId.startsWith("user-")) {
    const legacyUserId = sessionId.slice("user-".length);
    if (legacyUserId) {
      connection = await db.query.metaConnection.findFirst({
        where: and(
          eq(metaConnection.userId, legacyUserId),
          eq(metaConnection.platform, "whatsapp")
        ),
      });
    }
  } else {
    const allWa = await db.query.metaConnection.findMany({
      where: eq(metaConnection.platform, "whatsapp"),
    });
    connection =
      allWa.find((c) => {
        const meta = c.metadata;
        return meta?.sessionId === sessionId;
      }) ?? null;
  }

  if (connection) {
    organizationId = connection.organizationId;
  }

  const userId: string | null = connection?.userId ?? null;

  if (!userId || !connection || !organizationId) {
    console.log(
      "[OpenWA Webhook] Connection not found for session:",
      sessionId
    );
    return new NextResponse(null, { status: 200 });
  }

  const contactJid = data.chatId || data.from || "";
  const contactPhone = contactJid.split("@")[0] || "";
  if (!contactPhone || !contactJid) {
    return NextResponse.json(
      { error: "Invalid contact phone" },
      { status: 400 }
    );
  }

  const isOutbound =
    data.fromMe === true ||
    data.fromMe === "true" ||
    data.key?.fromMe === true ||
    data.key?.fromMe === "true" ||
    data.id?.fromMe === true ||
    data.sender?.isMe === true ||
    data.isMe === true ||
    data.self === true ||
    data.self === "true" ||
    event === "message.sent" ||
    event === "outbound";

  const timestamp = data.timestamp
    ? new Date(data.timestamp * 1000)
    : new Date();

  let rawPayload: Record<string, any> = {};

  if (isOutbound) {
    rawPayload = {
      direction: "outbound",
      threadKey: `whatsapp:${contactPhone}`,
      recipientId: contactPhone,
      accountId: connection.platformAccountId,
      platform: "whatsapp",
      text: data.body || "",
    };
  } else {
    const senderName =
      data.pushname || data.senderName || data.authorName || contactPhone;

    const isImage =
      data.type === "image" || data.mimetype?.startsWith("image/");
    const imageUrl = data.body?.startsWith("data:image")
      ? data.body
      : data.clientUrl || data.deprecatedMms3Url || undefined;

    rawPayload = {
      entry: [
        {
          id: connection.platformAccountId,
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number:
                    connection.platformAccountName || "WhatsApp",
                  phone_number_id: connection.platformAccountId,
                },
                contacts: [
                  {
                    profile: { name: senderName },
                    wa_id: contactPhone,
                  },
                ],
                messages: [
                  isImage
                    ? {
                        from: contactPhone,
                        id: data.id,
                        timestamp: String(Math.floor(timestamp.getTime() / 1000)),
                        type: "image",
                        image: {
                          mime_type: data.mimetype || "image/jpeg",
                          sha256: data.sha || "",
                          url: imageUrl,
                          id: data.id,
                          caption: data.caption || "",
                        },
                      }
                    : {
                        from: contactPhone,
                        id: data.id,
                        timestamp: String(Math.floor(timestamp.getTime() / 1000)),
                        text: { body: data.body || "" },
                        type: "text",
                      },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  // Insert event into DB
  const dedupeKey = `openwa:${sessionId}:${data.id}`;
  const inserted = await db
    .insert(metaWebhookEvent)
    .values({
      dedupeKey,
      platform: "whatsapp",
      object: "whatsapp_business_account",
      eventType: isOutbound ? "outbound" : "message",
      metaConnectionId: connection.id,
      userId,
      organizationId,
      platformAccountId: connection.platformAccountId,
      sourceId: data.id,
      rawPayload,
      status: "received",
      receivedAt: timestamp,
      processedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    console.log("[OpenWA Webhook] Duplicate message ignored:", data.id);
    return new NextResponse(null, { status: 200 });
  }

  // Trigger inbox updates
  void triggerInboxBroadcast(organizationId);

  // Enqueue AI reply job for incoming messages
  if (!isOutbound) {
    const accessToken =
      connection.accessToken ??
      connection.facebookPageAccessToken ??
      connection.whatsappAccessToken;

    if (accessToken) {
      const isImage =
        data.type === "image" || data.mimetype?.startsWith("image/");
      const imageUrl = data.body?.startsWith("data:image")
        ? data.body
        : data.clientUrl || data.deprecatedMms3Url || undefined;

      const job: MetaDMReplyJob = {
        eventId: dedupeKey,
        platform: "whatsapp",
        connectionId: connection.id,
        userId,
        organizationId,
        recipientId: contactJid,
        threadId: `whatsapp:${contactPhone}`,
        incomingMessage: {
          text: isImage ? data.caption || "" : data.body || "",
          imageUrls: isImage && imageUrl ? [imageUrl] : undefined,
          timestamp: timestamp.getTime(),
        },
        accessToken,
        accountId:
          connection.whatsappPhoneNumberId ?? connection.platformAccountId,
      };

      try {
        await queue.enqueue("meta-dm-reply", job, {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
        });
        console.log("[OpenWA Webhook] Enqueued DM reply job:", dedupeKey);
      } catch (err) {
        console.error("[OpenWA Webhook] Failed to enqueue job:", err);
      }
    }
  }

  return new NextResponse(null, { status: 204 });
}
