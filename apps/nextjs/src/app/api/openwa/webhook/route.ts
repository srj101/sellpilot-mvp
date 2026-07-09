import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { and, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { metaConnection, metaWebhookEvent } from "@acme/db/schema";

import { env } from "~/env";
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

  const webhookSecret =
    env.OPENWA_WEBHOOK_SECRET ?? env.META_WEBHOOK_VERIFY_TOKEN;
  if (webhookSecret) {
    if (!verifyOpenWASignature(rawBody, signatureHeader, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn(
      "[OpenWA Webhook] No webhook secret configured; skipping signature verification.",
    );
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
  if (!contactPhone || !contactJid) {
    return NextResponse.json(
      { error: "Invalid contact phone" },
      { status: 400 },
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
                    profile: {
                      name: senderName,
                    },
                    wa_id: contactPhone,
                  },
                ],
                messages: [
                  isImage
                    ? {
                        from: contactPhone,
                        id: data.id,
                        timestamp: String(
                          Math.floor(timestamp.getTime() / 1000),
                        ),
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
                        timestamp: String(
                          Math.floor(timestamp.getTime() / 1000),
                        ),
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
  const inserted = await db
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
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    console.log("[OpenWA Webhook] Duplicate message ignored:", data.id);
    return new NextResponse(null, { status: 200 });
  }

  // Trigger inbox updates over SSE for this user
  void triggerInboxBroadcast(userId);

  // Trigger AI-driven reply for incoming messages
  if (!isOutbound) {
    const accessToken =
      connection.accessToken ??
      connection.facebookPageAccessToken ??
      connection.whatsappAccessToken;

    if (accessToken) {
      // Run asynchronously so we don't block the webhook response
      void (async () => {
        try {
          const { runChat } = await import("~/lib/ai");

          const isImage =
            data.type === "image" || data.mimetype?.startsWith("image/");
          const imageUrl = data.body?.startsWith("data:image")
            ? data.body
            : data.clientUrl || data.deprecatedMms3Url || null;

          let imageSearchResultsText = "";
          if (isImage && imageUrl) {
            try {
              const { searchProductsByImage } = await import("~/lib/chromadb");
              const matches = await searchProductsByImage({
                userId,
                imageUrl,
                limit: 3,
              });

              if (matches.length > 0) {
                imageSearchResultsText =
                  `[Customer sent an image. Image search matches found:\n` +
                  matches
                    .map(
                      (m) =>
                        `- Product: ${m.productTitle} (ID: ${m.productId}). Similarity distance: ${m.distance.toFixed(4)}`,
                    )
                    .join("\n") +
                  `\nUse this context to answer. If a match is close, mention the product name, price, stock, and offer to show images or details. If no good match, politely ask if they want to search for something else.]`;
              } else {
                imageSearchResultsText = `[Customer sent an image. No product matches were found in the database. Politely inform them and offer to search manually.]`;
              }
            } catch (err) {
              console.error(
                "[OpenWA Webhook AIReply] Image search failed:",
                err,
              );
            }
          }

          const userMessage = isImage ? data.caption || "" : data.body || "";
          const finalMessage = imageSearchResultsText
            ? `${imageSearchResultsText}\n\n${userMessage}`.trim()
            : userMessage;

          let aiReply = "";
          try {
            const threadId = `whatsapp:${contactPhone}`;

            // Send a friendly patience message if AI takes more than 8 seconds
            let patienceSent = false;
            const patienceTimer = setTimeout(async () => {
              patienceSent = true;
              const patienceMessages = [
                "Just a moment, I'm looking into this for you...",
                "Give me a second, I'm checking that for you...",
                "One moment please, I'm finding the best answer...",
                "Hold on, I'm pulling up the details for you...",
              ];
              const msg =
                patienceMessages[
                  Math.floor(Math.random() * patienceMessages.length)
                ]!;
              try {
                await sendMetaInboxReply({
                  platform: "whatsapp",
                  accessToken,
                  accountId:
                    connection.whatsappPhoneNumberId ??
                    connection.platformAccountId,
                  recipientId: contactJid,
                  text: msg,
                });
                console.log("[OpenWA Webhook AIReply] Patience message sent");
              } catch (err) {
                console.error(
                  "[OpenWA Webhook AIReply] Failed to send patience message:",
                  err,
                );
              }
            }, 8000);

            aiReply = await runChat(finalMessage, userId, threadId, {
              platform: "whatsapp",
              accessToken,
              accountId:
                connection.whatsappPhoneNumberId ??
                connection.platformAccountId,
              recipientId: contactPhone,
              connectionId: connection.id,
            });

            clearTimeout(patienceTimer);
          } catch (e) {
            console.error(
              "[OpenWA Webhook AIReply] runChat failed, using neutral fallback:",
              e,
            );
            aiReply =
              "Sorry — I'm having trouble processing your message right now. We'll get back to you shortly.";
          }

          let sent: any = {};
          try {
            sent = await sendMetaInboxReply({
              platform: "whatsapp",
              accessToken,
              accountId:
                connection.whatsappPhoneNumberId ??
                connection.platformAccountId,
              recipientId: contactJid,
              text: aiReply,
            });
          } catch (sendErr) {
            console.error(
              "[OpenWA Webhook AIReply] sendMetaInboxReply failed:",
              sendErr,
            );
          }

          await db.insert(metaWebhookEvent).values({
            dedupeKey: `outbound:aireply:${contactPhone}:${Date.now()}:${crypto.randomUUID()}`,
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
              text: aiReply,
              response: sent.raw,
            },
            status: "sent",
            processedAt: new Date(),
          });

          // Trigger inbox updates so the reply shows up in the UI
          void triggerInboxBroadcast(userId);
        } catch (error) {
          console.error(
            "[OpenWA Webhook AIReply] Error handling AI reply:",
            error,
          );
        }
      })();
    }
  }

  return new NextResponse(null, { status: 204 });
}
