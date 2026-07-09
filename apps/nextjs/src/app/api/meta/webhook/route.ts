import { NextRequest, NextResponse } from "next/server";

import { and, desc, eq, or } from "@acme/db";
import { db } from "@acme/db/client";
import { metaConnection, metaWebhookEvent } from "@acme/db/schema";

import { env } from "~/env";
import { triggerInboxBroadcast } from "~/lib/inbox-broadcast";
import { sendMetaInboxReply } from "~/lib/meta";
import {
  normalizeMetaWebhookPayload,
  verifyMetaWebhookSignature,
} from "~/lib/meta-webhook";

export const runtime = "nodejs";

function isInboundCustomerMessage(event: {
  platform: string;
  eventType: string;
  rawPayload: Record<string, unknown>;
}) {
  const isMsg = ["message", "messages", "quick_reply", "postback"].includes(
    event.eventType,
  );
  if (!isMsg) return false;

  const rawPayload = event.rawPayload;

  if (rawPayload.direction === "outbound") return false;

  if (event.platform === "facebook_page" || event.platform === "instagram") {
    const entry = Array.isArray(rawPayload.entry) ? rawPayload.entry : [];
    const firstEntry =
      typeof entry[0] === "object" && entry[0] !== null
        ? (entry[0] as Record<string, unknown>)
        : {};
    const messaging = Array.isArray(firstEntry.messaging)
      ? firstEntry.messaging
      : [];
    const firstMessaging =
      typeof messaging[0] === "object" && messaging[0] !== null
        ? (messaging[0] as Record<string, unknown>)
        : {};
    const message =
      typeof firstMessaging.message === "object" &&
      firstMessaging.message !== null
        ? (firstMessaging.message as Record<string, unknown>)
        : {};

    if (message.is_echo === true) {
      return false;
    }
  }

  return true;
}

function getRecipientId(
  event: {
    platform: string;
    eventType: string;
    rawPayload: Record<string, unknown>;
  },
  sourceId?: string,
) {
  const rawPayload = event.rawPayload;
  if (event.platform === "whatsapp") {
    const entry = Array.isArray(rawPayload.entry) ? rawPayload.entry : [];
    const firstEntry =
      typeof entry[0] === "object" && entry[0] !== null
        ? (entry[0] as Record<string, unknown>)
        : {};
    const changes = Array.isArray(firstEntry.changes) ? firstEntry.changes : [];
    const firstChange =
      typeof changes[0] === "object" && changes[0] !== null
        ? (changes[0] as Record<string, unknown>)
        : {};
    const value =
      typeof firstChange.value === "object" && firstChange.value !== null
        ? (firstChange.value as Record<string, unknown>)
        : {};
    const messages = Array.isArray(value.messages) ? value.messages : [];
    const firstMessage =
      typeof messages[0] === "object" && messages[0] !== null
        ? (messages[0] as Record<string, unknown>)
        : {};
    const contacts = Array.isArray(value.contacts) ? value.contacts : [];
    const contact =
      typeof contacts[0] === "object" && contacts[0] !== null
        ? (contacts[0] as Record<string, unknown>)
        : {};

    return (
      (firstMessage.from as string) ??
      (contact.wa_id as string) ??
      (value.from as string) ??
      sourceId
    );
  }

  const entry = Array.isArray(rawPayload.entry) ? rawPayload.entry : [];
  const firstEntry =
    typeof entry[0] === "object" && entry[0] !== null
      ? (entry[0] as Record<string, unknown>)
      : {};
  const messaging = Array.isArray(firstEntry.messaging)
    ? firstEntry.messaging
    : [];
  const firstMessaging =
    typeof messaging[0] === "object" && messaging[0] !== null
      ? (messaging[0] as Record<string, unknown>)
      : {};
  const sender =
    typeof firstMessaging.sender === "object" && firstMessaging.sender !== null
      ? (firstMessaging.sender as Record<string, unknown>)
      : {};
  return (sender.id as string) ?? sourceId;
}

function getThreadId(
  event: {
    platform: string;
    platformAccountId: string;
    rawPayload: Record<string, unknown>;
  },
  sourceId?: string,
) {
  const rawPayload = event.rawPayload;
  if (event.platform === "whatsapp") {
    const entry = Array.isArray(rawPayload.entry) ? rawPayload.entry : [];
    const firstEntry =
      typeof entry[0] === "object" && entry[0] !== null
        ? (entry[0] as Record<string, unknown>)
        : {};
    const changes = Array.isArray(firstEntry.changes) ? firstEntry.changes : [];
    const firstChange =
      typeof changes[0] === "object" && changes[0] !== null
        ? (changes[0] as Record<string, unknown>)
        : {};
    const value =
      typeof firstChange.value === "object" && firstChange.value !== null
        ? (firstChange.value as Record<string, unknown>)
        : {};
    const messages = Array.isArray(value.messages) ? value.messages : [];
    const firstMessage =
      typeof messages[0] === "object" && messages[0] !== null
        ? (messages[0] as Record<string, unknown>)
        : {};
    const contacts = Array.isArray(value.contacts) ? value.contacts : [];
    const contact =
      typeof contacts[0] === "object" && contacts[0] !== null
        ? (contacts[0] as Record<string, unknown>)
        : {};
    const contactId =
      (firstMessage.from as string) ?? (contact.wa_id as string) ?? sourceId;
    if (contactId) {
      return `whatsapp:${contactId}`;
    }
  }

  const entry = Array.isArray(rawPayload.entry) ? rawPayload.entry : [];
  const firstEntry =
    typeof entry[0] === "object" && entry[0] !== null
      ? (entry[0] as Record<string, unknown>)
      : {};
  const messaging = Array.isArray(firstEntry.messaging)
    ? firstEntry.messaging
    : [];
  const firstMessaging =
    typeof messaging[0] === "object" && messaging[0] !== null
      ? (messaging[0] as Record<string, unknown>)
      : {};
  const sender =
    typeof firstMessaging.sender === "object" && firstMessaging.sender !== null
      ? (firstMessaging.sender as Record<string, unknown>)
      : {};
  const contactId = (sender.id as string) ?? sourceId;
  if (contactId) {
    return `${event.platform}:${contactId}`;
  }
  return null;
}

async function handleAutoReply(event: any, connection: any) {
  try {
    const accessToken =
      connection.accessToken ??
      connection.facebookPageAccessToken ??
      connection.whatsappAccessToken;

    if (!accessToken) {
      console.warn(
        "[Webhook AutoReply] Access token missing for connection:",
        connection.id,
      );
      return;
    }

    const recipientId = getRecipientId(event, event.sourceId);
    const threadId = getThreadId(event, event.sourceId);

    if (!recipientId || !threadId) {
      console.warn(
        "[Webhook AutoReply] Could not resolve recipientId or threadId",
      );
      return;
    }

    // Extract a reasonable incoming message text to seed the AI
    const raw = event.rawPayload ?? {};
    let incomingText: string | null = null;

    try {
      if (event.platform === "whatsapp") {
        const entry = Array.isArray(raw.entry) ? raw.entry[0] : raw.entry;
        const value = entry?.changes?.[0]?.value ?? entry?.value ?? raw;
        incomingText =
          value?.messages?.[0]?.text?.body ??
          value?.messages?.[0]?.text ??
          null;
      } else {
        const entry = Array.isArray(raw.entry) ? raw.entry[0] : raw.entry;
        const messaging = Array.isArray(entry?.messaging)
          ? entry.messaging[0]
          : (entry?.messaging ?? entry);
        incomingText =
          messaging?.message?.text?.body ??
          messaging?.message?.text ??
          messaging?.message?.text?.text ??
          messaging?.postback?.payload ??
          messaging?.message?.quick_reply?.payload ??
          null;
      }
    } catch (err) {
      incomingText = null;
    }

    const userMessage =
      typeof incomingText === "string" && incomingText.trim().length > 0
        ? incomingText
        : "";

    // Extract if there is an image URL
    let imageSearchQueryUrl: string | null = null;
    try {
      if (event.platform === "whatsapp") {
        const entry = Array.isArray(raw.entry) ? raw.entry[0] : raw.entry;
        const value = entry?.changes?.[0]?.value ?? entry?.value ?? raw;
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        if (messages[0]?.type === "image") {
          imageSearchQueryUrl = messages[0].image?.url || null;
        }
      } else {
        const entry = Array.isArray(raw.entry) ? raw.entry[0] : raw.entry;
        const messaging = Array.isArray(entry?.messaging)
          ? entry.messaging[0]
          : (entry?.messaging ?? entry);
        const attachments = Array.isArray(messaging?.message?.attachments)
          ? messaging.message.attachments
          : [];
        if (attachments[0]?.type === "image") {
          imageSearchQueryUrl = attachments[0].payload?.url || null;
        }
      }
    } catch (err) {
      imageSearchQueryUrl = null;
    }

    let imageSearchResultsText = "";
    if (imageSearchQueryUrl) {
      try {
        const { searchProductsByImage } = await import("~/lib/chromadb");
        const matches = await searchProductsByImage({
          userId: connection.userId,
          imageUrl: imageSearchQueryUrl,
          limit: 3,
        });

        if (matches.length > 0) {
          imageSearchResultsText = `[Customer sent an image. Image search matches found:\n` +
            matches.map((m) => `- Product: ${m.productTitle} (ID: ${m.productId}). Similarity distance: ${m.distance.toFixed(4)}`).join("\n") +
            `\nUse this context to answer. If a match is close, mention the product name, price, stock, and offer to show images or details. If no good match, politely ask if they want to search for something else.]`;
        } else {
          imageSearchResultsText = `[Customer sent an image. No product matches were found in the database. Politely inform them and offer to search manually.]`;
        }
      } catch (err) {
        console.error("[Webhook AutoReply] Image search failed:", err);
      }
    }

    // Ask the AI to produce a reply
    let aiReply = "";
    try {
      const { runChat } = await import("~/lib/ai");
      const finalMessage = imageSearchResultsText
        ? `${imageSearchResultsText}\n\n${userMessage}`.trim()
        : userMessage;

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
        const msg = patienceMessages[Math.floor(Math.random() * patienceMessages.length)]!;
        try {
          await sendMetaInboxReply({
            platform: event.platform,
            accessToken,
            accountId:
              event.platform === "instagram"
                ? (connection.facebookPageId ?? event.platformAccountId)
                : event.platform === "whatsapp"
                  ? (connection.whatsappPhoneNumberId ?? event.platformAccountId)
                  : event.platformAccountId,
            recipientId,
            text: msg,
          });
          console.log("[Webhook AutoReply] Patience message sent");
        } catch (err) {
          console.error("[Webhook AutoReply] Failed to send patience message:", err);
        }
      }, 8000);

      aiReply = await runChat(finalMessage, connection.userId, threadId, {
        platform: event.platform,
        accessToken,
        accountId:
          event.platform === "instagram"
            ? (connection.facebookPageId ?? event.platformAccountId)
            : event.platform === "whatsapp"
              ? (connection.whatsappPhoneNumberId ?? event.platformAccountId)
              : event.platformAccountId,
        recipientId,
        connectionId: connection.id,
      });

      clearTimeout(patienceTimer);
    } catch (e) {
      console.error(
        "[Webhook AutoReply] AI runChat failed, falling back to neutral reply:",
        e,
      );
      aiReply =
        "Sorry — I'm having trouble processing your message right now. We'll get back to you shortly.";
    }

    console.log(
      `[Webhook AutoReply] Sending AI-reply to ${recipientId} via ${event.platform}...`,
    );
    const sent = await sendMetaInboxReply({
      platform: event.platform,
      accessToken,
      accountId:
        event.platform === "instagram"
          ? (connection.facebookPageId ?? event.platformAccountId)
          : event.platform === "whatsapp"
            ? (connection.whatsappPhoneNumberId ?? event.platformAccountId)
            : event.platformAccountId,
      recipientId,
      text: aiReply,
    });

    await db.insert(metaWebhookEvent).values({
      dedupeKey: `outbound:aireply:${threadId}:${Date.now()}:${crypto.randomUUID()}`,
      platform: event.platform,
      object: event.object,
      eventType: "outbound",
      metaConnectionId: connection.id,
      userId: connection.userId,
      platformAccountId: event.platformAccountId,
      sourceId: sent.messageId ?? null,
      rawPayload: {
        direction: "outbound",
        threadKey: threadId,
        recipientId,
        accountId: event.platformAccountId,
        platform: event.platform,
        text: aiReply,
        response: sent.raw,
      },
      headers: {},
      status: "sent",
      processedAt: new Date(),
    });
    console.log("[Webhook AutoReply] AI-reply successfully sent and logged!");
  } catch (error) {
    console.error("[Webhook AutoReply] Error handling auto reply:", error);
  }
}

async function resolveMetaConnection(event: {
  platform: "facebook_page" | "instagram" | "whatsapp";
  platformAccountId: string;
}) {
  let rows: (typeof metaConnection.$inferSelect)[] = [];
  switch (event.platform) {
    case "facebook_page":
      rows = await db
        .select()
        .from(metaConnection)
        .where(
          and(
            eq(metaConnection.platform, "facebook_page"),
            or(
              eq(metaConnection.facebookPageId, event.platformAccountId),
              eq(metaConnection.platformAccountId, event.platformAccountId),
            ),
          ),
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
              eq(
                metaConnection.instagramBusinessAccountId,
                event.platformAccountId,
              ),
              eq(metaConnection.platformAccountId, event.platformAccountId),
            ),
          ),
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
              eq(metaConnection.whatsappPhoneNumberId, event.platformAccountId),
              eq(metaConnection.platformAccountId, event.platformAccountId),
              eq(
                metaConnection.whatsappBusinessAccountId,
                event.platformAccountId,
              ),
            ),
          ),
        )
        .limit(1);
      break;
  }

  // Fallback to the latest connected channel of the platform if no match is resolved.
  // This supports sandbox default/mock payloads (e.g. 123456123, 0) during testing.
  if (rows.length === 0) {
    rows = await db
      .select()
      .from(metaConnection)
      .where(eq(metaConnection.platform, event.platform))
      .orderBy(desc(metaConnection.connectedAt))
      .limit(1);
  }

  return rows;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (!env.META_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  if (
    mode === "subscribe" &&
    token === env.META_WEBHOOK_VERIFY_TOKEN &&
    challenge
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const signatureHeader = req.headers.get("x-hub-signature-256");

  if (!env.META_APP_SECRET) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const rawBody = await req.text();
  console.log("[Webhook POST] Incoming raw body:", rawBody);

  if (
    !verifyMetaWebhookSignature(rawBody, signatureHeader, env.META_APP_SECRET)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const normalizedEvents = normalizeMetaWebhookPayload(payload);
  if (normalizedEvents.length === 0) {
    return new NextResponse("EVENT_RECEIVED", { status: 200 });
  }

  const headers = Object.fromEntries(req.headers.entries());

  const rows: (typeof metaWebhookEvent.$inferInsert)[] = [];

  for (const event of normalizedEvents) {
    const connectionRows = await resolveMetaConnection(event);
    const connection = connectionRows[0];

    rows.push({
      dedupeKey: event.dedupeKey,
      platform: event.platform,
      object: event.object,
      eventType: event.eventType,
      metaConnectionId: connection?.id ?? null,
      userId: connection?.userId ?? null,
      platformAccountId: event.platformAccountId,
      sourceId: event.sourceId ?? null,
      rawPayload: event.rawPayload,
      headers,
      status: connection ? "queued" : "orphaned",
    });
  }

  const inserted = await db
    .insert(metaWebhookEvent)
    .values(rows)
    .onConflictDoNothing()
    .returning();

  const insertedDedupeKeys = new Set(inserted.map((r) => r.dedupeKey));

  // Trigger inbox updates over SSE for all affected users
  const userIds = new Set<string>();
  for (const row of rows) {
    if (row.userId) {
      userIds.add(row.userId);
    }
  }
  for (const userId of userIds) {
    void triggerInboxBroadcast(userId);
  }

  // Send auto-replies for inbound messages
  for (const event of normalizedEvents) {
    if (!insertedDedupeKeys.has(event.dedupeKey)) {
      console.log("[Webhook] Duplicate event ignored for auto-reply:", event.dedupeKey);
      continue;
    }
    const connectionRows = await resolveMetaConnection(event);
    const connection = connectionRows[0];

    if (connection && connection.userId) {
      const isIncoming = isInboundCustomerMessage(event);
      if (isIncoming) {
        // Run auto-reply in background
        void handleAutoReply(event, connection);
      }
    }
  }

  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}
