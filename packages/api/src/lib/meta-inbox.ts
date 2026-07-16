import type { metaConnection, metaWebhookEvent } from "@acme/db/schema";

import type { MetaInboxPlatform } from "./meta";

export type MetaWebhookEventRow = typeof metaWebhookEvent.$inferSelect;
export type MetaConnectionRow = typeof metaConnection.$inferSelect;

export interface InboxMessage {
  id: string;
  threadId: string;
  platform: MetaInboxPlatform;
  direction: "inbound" | "outbound";
  authorLabel: string;
  contactLabel: string;
  text: string;
  timestamp: Date;
  status?: string;
  replyTargetId?: string;
  sourceId?: string;
  isRead: boolean;
  imageUrl?: string;
}

export interface InboxThread {
  id: string;
  platform: MetaInboxPlatform;
  platformLabel: string;
  accountId: string;
  accountLabel: string;
  contactId: string;
  contactLabel: string;
  replyTargetId: string;
  lastMessageAt: Date;
  preview: string;
  messageCount: number;
  messages: InboxMessage[];
}

export interface InboxActivityItem {
  id: string;
  title: string;
  detail: string;
  platformLabel: string;
  timestamp: Date;
}

export interface BuildInboxDataInput {
  events: MetaWebhookEventRow[];
  connections: MetaConnectionRow[];
  resolvedNames?: Record<string, string>;
}

export interface BuildInboxDataResult {
  threads: InboxThread[];
  activity: InboxActivityItem[];
  stats: {
    threadCount: number;
    messageCount: number;
    activityCount: number;
    platformCount: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value < 1_000_000_000_000 ? value * 1000 : value);
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = new Date(
      Number.isNaN(Number(value)) ? value : Number(value),
    );
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function platformLabel(platform: MetaInboxPlatform): string {
  switch (platform) {
    case "facebook_page":
      return "Facebook";
    case "instagram":
      return "Instagram";
    case "whatsapp":
      return "WhatsApp";
  }
}

function defaultAccountLabel(connection?: MetaConnectionRow): string {
  if (!connection) {
    return "Unknown account";
  }

  return (
    connection.facebookPageName ??
    connection.instagramUsername ??
    connection.whatsappBusinessAccountId ??
    connection.whatsappPhoneNumberId ??
    connection.platformAccountId ??
    "Connected account"
  );
}

function connectionKey(platform: MetaInboxPlatform, accountId: string) {
  return `${platform}:${accountId}`;
}

function lookupConnection(
  connections: MetaConnectionRow[],
  platform: MetaInboxPlatform,
  accountId: string,
) {
  return connections.find((connection) => {
    if (connection.platform !== platform) {
      return false;
    }

    if (connection.platformAccountId === accountId) {
      return true;
    }

    if (platform === "facebook_page") {
      return connection.facebookPageId === accountId;
    }

    if (platform === "instagram") {
      return connection.instagramBusinessAccountId === accountId;
    }

    return (
      connection.whatsappPhoneNumberId === accountId ||
      connection.whatsappBusinessAccountId === accountId
    );
  });
}

function shortId(value: string) {
  if (value.length <= 8) {
    return value;
  }

  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function extractPageOrInstagramEntry(rawPayload: Record<string, unknown>) {
  const entry = asArray(rawPayload.entry);
  const firstEntry = asRecord(entry[0]);
  const messaging = asArray(firstEntry.messaging);
  return asRecord(messaging[0]);
}

function extractWhatsAppValue(rawPayload: Record<string, unknown>) {
  const entry = asArray(rawPayload.entry);
  const firstEntry = asRecord(entry[0]);
  const changes = asArray(firstEntry.changes);
  const firstChange = asRecord(changes[0]);
  return asRecord(firstChange.value);
}

function extractTextFromMessengerPayload(payload: Record<string, unknown>) {
  const message = asRecord(payload.message);
  return (
    asString(message.text) ??
    asString(message.caption) ??
    asString(message.payload) ??
    asString(asRecord(payload.postback).payload) ??
    "New message"
  );
}

function extractTextFromWhatsAppPayload(payload: Record<string, unknown>) {
  const messages = asArray(payload.messages);
  const firstMessage = asRecord(messages[0]);
  const text = asRecord(firstMessage.text);
  const interactive = asRecord(firstMessage.interactive);
  const button = asRecord(firstMessage.button);

  return (
    asString(text.body) ??
    asString(
      interactive.button_reply && asRecord(interactive.button_reply).title,
    ) ??
    asString(
      interactive.list_reply && asRecord(interactive.list_reply).title,
    ) ??
    asString(button.text) ??
    asString(firstMessage.type) ??
    "New WhatsApp message"
  );
}

function extractTimestamp(
  event: MetaWebhookEventRow,
  rawPayload: Record<string, unknown>,
  platform: MetaInboxPlatform,
) {
  if (platform === "whatsapp") {
    const value = extractWhatsAppValue(rawPayload);
    const messages = asArray(value.messages);
    const message = asRecord(messages[0]);
    const timestamp = asDate(message.timestamp);
    if (timestamp) {
      return timestamp;
    }
  } else {
    const payload = extractPageOrInstagramEntry(rawPayload);
    const timestamp = asDate(payload.timestamp);
    if (timestamp) {
      return timestamp;
    }
  }

  return event.receivedAt;
}

function extractThreadKey(
  event: MetaWebhookEventRow,
  rawPayload: Record<string, unknown>,
) {
  const explicit = asString(rawPayload.threadKey);
  if (explicit) {
    return explicit;
  }

  const direction = asString(rawPayload.direction);
  if (direction === "outbound") {
    const recipientId = asString(rawPayload.recipientId) ?? event.sourceId;
    if (recipientId) {
      return connectionKey(event.platform as MetaInboxPlatform, recipientId);
    }
  }

  if (event.platform === "whatsapp") {
    const value = extractWhatsAppValue(rawPayload);
    const messages = asArray(value.messages);
    const message = asRecord(messages[0]);
    const contacts = asArray(value.contacts);
    const contact = asRecord(contacts[0]);
    const contactId =
      asString(message.from) ?? asString(contact.wa_id) ?? event.sourceId;

    if (contactId) {
      return connectionKey(event.platform as MetaInboxPlatform, contactId);
    }
  }

  const payload = extractPageOrInstagramEntry(rawPayload);
  const sender = asRecord(payload.sender);
  const contactId = asString(sender.id) ?? event.sourceId;

  if (contactId) {
    return connectionKey(event.platform as MetaInboxPlatform, contactId);
  }

  return null;
}

function extractContactLabel(
  event: MetaWebhookEventRow,
  rawPayload: Record<string, unknown>,
  connection?: MetaConnectionRow,
  resolvedNames?: Record<string, string>,
) {
  const directLabel = asString(rawPayload.contactLabel);
  if (directLabel) {
    return directLabel;
  }

  if (event.platform === "whatsapp") {
    const value = extractWhatsAppValue(rawPayload);
    const contacts = asArray(value.contacts);
    const contact = asRecord(contacts[0]);
    const profile = asRecord(contact.profile);
    const contactLabel =
      asString(profile.name) ?? asString(contact.wa_id) ?? asString(value.from);

    if (contactLabel) {
      return contactLabel;
    }
  }

  const direction = asString(rawPayload.direction);
  const isOutbound = direction === "outbound" || event.eventType === "outbound";

  const payload = extractPageOrInstagramEntry(rawPayload);
  const sender = asRecord(payload.sender);

  const customerId = isOutbound
    ? (asString(rawPayload.recipientId) ?? event.sourceId)
    : asString(sender.id);

  const senderName = asString(sender.name);
  if (senderName && !isOutbound) {
    return senderName;
  }

  if (customerId) {
    if (resolvedNames) {
      const resolved = resolvedNames[`${event.platform}:${customerId}`];
      if (resolved) {
        return resolved;
      }
    }
    return `Contact ${shortId(customerId)}`;
  }

  return defaultAccountLabel(connection);
}

function extractReplyTargetId(
  event: MetaWebhookEventRow,
  rawPayload: Record<string, unknown>,
) {
  const directRecipient = asString(rawPayload.recipientId);
  if (directRecipient) {
    return directRecipient;
  }

  if (event.platform === "whatsapp") {
    const value = extractWhatsAppValue(rawPayload);
    const messages = asArray(value.messages);
    const message = asRecord(messages[0]);
    const contacts = asArray(value.contacts);
    const contact = asRecord(contacts[0]);

    return (
      asString(message.from) ?? asString(contact.wa_id) ?? asString(value.from)
    );
  }

  const payload = extractPageOrInstagramEntry(rawPayload);
  const sender = asRecord(payload.sender);
  return asString(sender.id);
}

function extractMessageText(
  event: MetaWebhookEventRow,
  rawPayload: Record<string, unknown>,
) {
  const direction = asString(rawPayload.direction);
  if (direction === "outbound") {
    return asString(rawPayload.text) ?? "Sent message";
  }

  if (event.platform === "whatsapp") {
    const value = extractWhatsAppValue(rawPayload);
    const messages = asArray(value.messages);
    const m = asRecord(messages[0]);
    if (asString(m.type) === "image") {
      const img = asRecord(m.image);
      const caption = asString(img.caption);
      return caption ?? "Sent an image";
    }
    return extractTextFromWhatsAppPayload(value);
  }

  const payload = extractPageOrInstagramEntry(rawPayload);
  const message = asRecord(payload.message);
  const attachments = asArray(message.attachments);
  if (attachments.length > 0) {
    const firstAttachment = asRecord(attachments[0]);
    if (asString(firstAttachment.type) === "image") {
      return "Sent an image";
    }
  }

  return extractTextFromMessengerPayload(payload);
}

function isMessageEvent(event: MetaWebhookEventRow) {
  return ["message", "messages", "postback", "quick_reply", "outbound"].includes(
    event.eventType,
  );
}

function isActivityEvent(event: MetaWebhookEventRow) {
  return !isMessageEvent(event);
}

function sortNewestFirst(
  left: { timestamp: Date },
  right: { timestamp: Date },
) {
  return right.timestamp.getTime() - left.timestamp.getTime();
}

export function buildInboxData({
  events,
  connections,
  resolvedNames,
}: BuildInboxDataInput): BuildInboxDataResult {
  const threadsById = new Map<string, InboxThread>();
  const activity: InboxActivityItem[] = [];

  for (const event of events) {
    const rawPayload = asRecord(event.rawPayload);
    const connection = lookupConnection(
      connections,
      event.platform as MetaInboxPlatform,
      event.platformAccountId,
    );

    if (isMessageEvent(event)) {
      const threadKey = extractThreadKey(event, rawPayload);
      if (!threadKey) {
        continue;
      }

      const timestamp = extractTimestamp(
        event,
        rawPayload,
        event.platform as MetaInboxPlatform,
      );
      const replyTargetId = extractReplyTargetId(event, rawPayload) ?? "";
      const contactLabel = extractContactLabel(event, rawPayload, connection, resolvedNames);
      const messageText = extractMessageText(event, rawPayload);
      const direction =
        asString(rawPayload.direction) === "outbound" ? "outbound" : "inbound";
      const accountLabel =
        asString(rawPayload.accountLabel) ?? defaultAccountLabel(connection);

      let imageUrl: string | undefined = undefined;
      if (direction === "inbound") {
        if (event.platform === "whatsapp") {
          const val = extractWhatsAppValue(rawPayload);
          const msgs = asArray(val.messages);
          const m = asRecord(msgs[0]);
          if (asString(m.type) === "image") {
            const img = asRecord(m.image);
            imageUrl = asString(img.url);
          }
        } else {
          const payload = extractPageOrInstagramEntry(rawPayload);
          const message = asRecord(payload.message);
          const attachments = asArray(message.attachments);
          if (attachments.length > 0) {
            const firstAttachment = asRecord(attachments[0]);
            if (asString(firstAttachment.type) === "image") {
              const attachmentPayload = asRecord(firstAttachment.payload);
              imageUrl = asString(attachmentPayload.url);
            }
          }
        }
      }

      const message: InboxMessage = {
        id: event.id,
        threadId: threadKey,
        platform: event.platform as MetaInboxPlatform,
        direction,
        authorLabel: direction === "outbound" ? "You" : contactLabel,
        contactLabel,
        text: messageText,
        timestamp,
        status: asString(event.status),
        replyTargetId,
        sourceId: event.sourceId ?? undefined,
        isRead: event.isRead,
        imageUrl,
      };

      const existingThread = threadsById.get(threadKey);
      if (existingThread) {
        existingThread.messages.push(message);
        existingThread.lastMessageAt =
          message.timestamp > existingThread.lastMessageAt
            ? message.timestamp
            : existingThread.lastMessageAt;
        existingThread.preview = message.text;
        existingThread.messageCount += 1;
        continue;
      }

      threadsById.set(threadKey, {
        id: threadKey,
        platform: event.platform as MetaInboxPlatform,
        platformLabel: platformLabel(event.platform as MetaInboxPlatform),
        accountId: event.platformAccountId,
        accountLabel,
        contactId: replyTargetId || threadKey,
        contactLabel,
        replyTargetId,
        lastMessageAt: timestamp,
        preview: message.text,
        messageCount: 1,
        messages: [message],
      });
      continue;
    }

    if (isActivityEvent(event)) {
      const timestamp = event.receivedAt;
      const detail =
        asString(rawPayload.message) ??
        asString(rawPayload.description) ??
        asString(rawPayload.title) ??
        asString(rawPayload.comment) ??
        asString(rawPayload.status) ??
        event.eventType;

      activity.push({
        id: event.id,
        title: `${platformLabel(event.platform as MetaInboxPlatform)} ${event.eventType}`,
        detail,
        platformLabel: platformLabel(event.platform as MetaInboxPlatform),
        timestamp,
      });
    }
  }

  const threads = Array.from(threadsById.values())
    .map((thread) => ({
      ...thread,
      messages: thread.messages.sort(sortNewestFirst).reverse(),
    }))
    .sort(
      (left, right) =>
        right.lastMessageAt.getTime() - left.lastMessageAt.getTime(),
    );

  activity.sort(sortNewestFirst);

  const platformCount = new Set(threads.map((thread) => thread.platform)).size;

  return {
    threads,
    activity,
    stats: {
      threadCount: threads.length,
      messageCount: threads.reduce(
        (total, thread) => total + thread.messageCount,
        0,
      ),
      activityCount: activity.length,
      platformCount,
    },
  };
}
