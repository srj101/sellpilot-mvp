import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { and, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { metaConnection, metaWebhookEvent } from "@acme/db/schema";

import { triggerInboxBroadcast } from "~/lib/inbox-broadcast";
import { sendMetaInboxReply } from "~/lib/meta";

export const runtime = "nodejs";

function verifyOpenWASignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
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

  // If a webhook secret is defined in environment, verify signature
  const webhookSecret = process.env.OPENWA_WEBHOOK_SECRET;
  if (
    webhookSecret &&
    !verifyOpenWASignature(rawBody, signatureHeader, webhookSecret)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, sessionId, data } = body;

  // Log every incoming webhook event so we can debug event names
  console.log(
    "[OpenWA Webhook] Incoming event:",
    event,
    "sessionId:",
    sessionId,
    "keys:",
    Object.keys(body),
  );
  console.log(
    "[OpenWA Webhook] Full body:",
    JSON.stringify(body).slice(0, 1000),
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
      { status: 400 },
    );
  }

  // Derive userId from sessionId.
  // OpenWA may send either the friendly name ("user-<userId>") or the internal UUID.
  let userId: string | null = null;
  let connection: any = null;

  if (sessionId.startsWith("user-")) {
    // Friendly name format: user-<userId>
    userId = sessionId.slice("user-".length);
    if (userId) {
      connection = await db.query.metaConnection.findFirst({
        where: and(
          eq(metaConnection.userId, userId),
          eq(metaConnection.platform, "whatsapp"),
        ),
      });
    }
  } else {
    // UUID format — look up all WhatsApp connections and match by metadata.sessionId
    const allWa = await db.query.metaConnection.findMany({
      where: eq(metaConnection.platform, "whatsapp"),
    });
    connection =
      allWa.find((c) => {
        const meta = c.metadata;
        return meta?.sessionId === sessionId;
      }) ?? null;
    if (connection) {
      userId = connection.userId;
    }
  }

  if (!userId || !connection) {
    // Connection not saved yet (QR just scanned, save still in progress) — accept silently
    console.log(
      "[OpenWA Webhook] Connection not found yet for session:",
      sessionId,
      "— accepting silently",
    );
    return new NextResponse(null, { status: 200 });
  }

  const contactJid = data.chatId || data.from || "";
  const contactPhone = contactJid.split("@")[0] || "";
  if (!contactPhone) {
    return NextResponse.json(
      { error: "Invalid contact phone" },
      { status: 400 },
    );
  }

  const isOutbound = data.fromMe === true || event === "message.sent";
  const timestamp = data.timestamp
    ? new Date(data.timestamp * 1000)
    : new Date();

  let rawPayload: Record<string, any> = {};

  if (isOutbound) {
    // Standard outbound structure used by Meta connection replies
    rawPayload = {
      direction: "outbound",
      threadKey: `whatsapp:${contactPhone}`,
      recipientId: contactPhone,
      accountId: connection.platformAccountId,
      platform: "whatsapp",
      text: data.body || "",
    };
  } else {
    // Simulated Meta WhatsApp Cloud API incoming payload
    const senderName =
      data.pushname || data.senderName || data.authorName || contactPhone;
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
                    profile: {
                      name: senderName,
                    },
                    wa_id: contactPhone,
                  },
                ],
                messages: [
                  {
                    from: contactPhone,
                    id: data.id,
                    timestamp: String(Math.floor(timestamp.getTime() / 1000)),
                    text: {
                      body: data.body || "",
                    },
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

  // Insert normalized event into DB
  await db
    .insert(metaWebhookEvent)
    .values({
      dedupeKey: `openwa:${sessionId}:${data.id}`,
      platform: "whatsapp",
      object: "whatsapp_business_account",
      eventType: isOutbound ? "outbound" : "message",
      metaConnectionId: connection.id,
      userId,
      platformAccountId: connection.platformAccountId,
      sourceId: data.id,
      rawPayload,
      status: "received",
      receivedAt: timestamp,
      processedAt: new Date(),
    })
    .onConflictDoNothing();

  // Trigger inbox updates over SSE for this user
  void triggerInboxBroadcast(userId);

  // Trigger auto-reply for incoming messages
  if (!isOutbound) {
    const accessToken =
      connection.accessToken ??
      connection.facebookPageAccessToken ??
      connection.whatsappAccessToken;

    if (accessToken) {
      const messageText =
        "Automated reply from SellPilot , what do you want to know?";
      console.log(
        `[OpenWA Webhook AutoReply] Sending auto-reply to ${contactPhone}...`,
      );

      // Run asynchronously so we don't block the webhook response
      void (async () => {
        try {
          const sent = await sendMetaInboxReply({
            platform: "whatsapp",
            accessToken,
            accountId:
              connection.whatsappPhoneNumberId ?? connection.platformAccountId,
            recipientId: contactPhone,
            text: messageText,
          });

          await db.insert(metaWebhookEvent).values({
            dedupeKey: `outbound:autoreply:${contactPhone}:${Date.now()}:${crypto.randomUUID()}`,
            platform: "whatsapp",
            object: "whatsapp_business_account",
            eventType: "outbound",
            metaConnectionId: connection.id,
            userId,
            platformAccountId: connection.platformAccountId,
            sourceId: sent.messageId ?? null,
            rawPayload: {
              direction: "outbound",
              threadKey: `whatsapp:${contactPhone}`,
              recipientId: contactPhone,
              accountId: connection.platformAccountId,
              platform: "whatsapp",
              text: messageText,
              response: sent.raw,
            },
            status: "sent",
            processedAt: new Date(),
          });

          console.log(
            "[OpenWA Webhook AutoReply] Auto-reply successfully sent and logged!",
          );
          // Trigger inbox updates again so the reply shows up in the UI
          void triggerInboxBroadcast(userId);
        } catch (error) {
          console.error(
            "[OpenWA Webhook AutoReply] Error handling auto reply:",
            error,
          );
        }
      })();
    }
  }

  return new NextResponse(null, { status: 204 });
}
