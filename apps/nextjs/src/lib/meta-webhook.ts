import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type MetaWebhookPlatform = "facebook_page" | "instagram" | "whatsapp";
export type MetaWebhookObject =
  | "page"
  | "instagram"
  | "whatsapp_business_account";

export interface NormalizedMetaWebhookEvent {
  platform: MetaWebhookPlatform;
  object: MetaWebhookObject;
  eventType: string;
  platformAccountId: string;
  sourceId?: string;
  dedupeKey: string;
  rawPayload: Record<string, unknown>;
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
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = canonicalize(value[key]);
      return accumulator;
    }, {});
}

function createDedupeKey(
  parts: Array<string | undefined>,
  payload: unknown,
): string {
  const explicitKey = parts.filter(Boolean).join(":");
  if (explicitKey.length > 0) {
    return explicitKey;
  }

  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

function getMessagingEventType(
  messagingEvent: Record<string, unknown>,
): string {
  const message = asRecord(messagingEvent.message);
  const postback = asRecord(messagingEvent.postback);
  const quickReply = asRecord(message.quick_reply);
  const read = asRecord(messagingEvent.read);

  if (messagingEvent.message) {
    if (asString(quickReply.payload)) {
      return "quick_reply";
    }
    return "message";
  }

  if (asString(postback.payload)) {
    return "postback";
  }

  if (asString(read.watermark)) {
    return "read";
  }

  return "messaging";
}

function getMessagingSourceId(messagingEvent: Record<string, unknown>): string {
  const message = asRecord(messagingEvent.message);
  const postback = asRecord(messagingEvent.postback);
  const quickReply = asRecord(message.quick_reply);
  const read = asRecord(messagingEvent.read);

  return (
    asString(message.mid) ??
    asString(postback.mid) ??
    asString(quickReply.payload) ??
    asString(postback.payload) ??
    asString(read.watermark) ??
    createHash("sha256")
      .update(JSON.stringify(canonicalize(messagingEvent)))
      .digest("hex")
  );
}

function getChangeSourceId(change: Record<string, unknown>): string {
  const value = asRecord(change.value);
  const comment = asRecord(value.comment);

  return (
    asString(comment.id) ??
    asString(value.comment_id) ??
    asString(value.id) ??
    createHash("sha256")
      .update(JSON.stringify(canonicalize(change)))
      .digest("hex")
  );
}

function extractMessagingEvents(
  platform: MetaWebhookPlatform,
  object: MetaWebhookObject,
  accountId: string,
  messagingItems: unknown[],
  payload: Record<string, unknown>,
): NormalizedMetaWebhookEvent[] {
  return messagingItems.map((item) => {
    const messagingEvent = asRecord(item);

    return createEvent({
      platform,
      object,
      eventType: getMessagingEventType(messagingEvent),
      platformAccountId: accountId,
      sourceId: getMessagingSourceId(messagingEvent),
      payload,
    });
  });
}

function extractCommentEvents(
  platform: MetaWebhookPlatform,
  object: MetaWebhookObject,
  accountId: string,
  changeItems: unknown[],
  payload: Record<string, unknown>,
): NormalizedMetaWebhookEvent[] {
  return changeItems.flatMap((item) => {
    const change = asRecord(item);
    const field = asString(change.field);

    if (field !== "comments") {
      return [];
    }

    return [
      createEvent({
        platform,
        object,
        eventType: "comments",
        platformAccountId: accountId,
        sourceId: getChangeSourceId(change),
        payload,
      }),
    ];
  });
}

export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const received = Buffer.from(signatureHeader.slice("sha256=".length));
  const actual = Buffer.from(expected);

  if (received.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(received, actual);
}

function createEvent({
  platform,
  object,
  eventType,
  platformAccountId,
  sourceId,
  payload,
}: {
  platform: MetaWebhookPlatform;
  object: MetaWebhookObject;
  eventType: string;
  platformAccountId: string;
  sourceId?: string;
  payload: Record<string, unknown>;
}): NormalizedMetaWebhookEvent {
  const dedupeKey = createDedupeKey(
    [platform, object, eventType, platformAccountId, sourceId],
    payload,
  );

  return {
    platform,
    object,
    eventType,
    platformAccountId,
    sourceId,
    dedupeKey,
    rawPayload: payload,
  };
}

function normalizePageMessagingEntry(
  entry: Record<string, unknown>,
  payload: Record<string, unknown>,
): NormalizedMetaWebhookEvent[] {
  const pageId = asString(entry.id);
  if (!pageId) {
    return [];
  }

  return [
    ...extractMessagingEvents(
      "facebook_page",
      "page",
      pageId,
      asArray(entry.messaging),
      payload,
    ),
    ...extractCommentEvents(
      "facebook_page",
      "page",
      pageId,
      asArray(entry.changes),
      payload,
    ),
  ];
}

function normalizeInstagramEntry(
  entry: Record<string, unknown>,
  payload: Record<string, unknown>,
): NormalizedMetaWebhookEvent[] {
  const instagramBusinessAccountId = asString(entry.id);
  if (!instagramBusinessAccountId) {
    return [];
  }

  return [
    ...extractMessagingEvents(
      "instagram",
      "instagram",
      instagramBusinessAccountId,
      asArray(entry.messaging),
      payload,
    ),
    ...extractCommentEvents(
      "instagram",
      "instagram",
      instagramBusinessAccountId,
      asArray(entry.changes),
      payload,
    ),
  ];
}

function normalizeWhatsAppEntry(
  entry: Record<string, unknown>,
  payload: Record<string, unknown>,
): NormalizedMetaWebhookEvent[] {
  const events: NormalizedMetaWebhookEvent[] = [];

  for (const changeItem of asArray(entry.changes)) {
    const change = asRecord(changeItem);
    const value = asRecord(change.value);
    const metadata = asRecord(value.metadata);
    const phoneNumberId =
      asString(metadata.phone_number_id) ?? asString(entry.id);

    if (!phoneNumberId) {
      continue;
    }

    for (const messageItem of asArray(value.messages)) {
      const message = asRecord(messageItem);
      events.push(
        createEvent({
          platform: "whatsapp",
          object: "whatsapp_business_account",
          eventType: "messages",
          platformAccountId: phoneNumberId,
          sourceId:
            asString(message.id) ??
            createHash("sha256")
              .update(JSON.stringify(canonicalize(message)))
              .digest("hex"),
          payload,
        }),
      );
    }

    for (const statusItem of asArray(value.statuses)) {
      const status = asRecord(statusItem);
      events.push(
        createEvent({
          platform: "whatsapp",
          object: "whatsapp_business_account",
          eventType: "status",
          platformAccountId: phoneNumberId,
          sourceId:
            asString(status.id) ??
            createHash("sha256")
              .update(JSON.stringify(canonicalize(status)))
              .digest("hex"),
          payload,
        }),
      );
    }

    if (asString(change.field) === "message_template_status_update") {
      events.push(
        createEvent({
          platform: "whatsapp",
          object: "whatsapp_business_account",
          eventType: "message_template_status_update",
          platformAccountId: phoneNumberId,
          sourceId:
            asString(value.message_template_id) ??
            createHash("sha256")
              .update(JSON.stringify(canonicalize(change)))
              .digest("hex"),
          payload,
        }),
      );
    }

    if (
      asArray(value.messages).length === 0 &&
      asArray(value.statuses).length === 0
    ) {
      events.push(
        createEvent({
          platform: "whatsapp",
          object: "whatsapp_business_account",
          eventType: asString(change.field) ?? "change",
          platformAccountId: phoneNumberId,
          sourceId: createHash("sha256")
            .update(JSON.stringify(canonicalize(change)))
            .digest("hex"),
          payload,
        }),
      );
    }
  }

  return events;
}

export function normalizeMetaWebhookPayload(
  payload: unknown,
): NormalizedMetaWebhookEvent[] {
  if (!isRecord(payload)) {
    return [];
  }

  const object = asString(payload.object) as MetaWebhookObject | undefined;
  const entries = asArray(payload.entry);

  if (!object) {
    return [];
  }

  const events: NormalizedMetaWebhookEvent[] = [];

  for (const entryItem of entries) {
    const entry = asRecord(entryItem);

    if (object === "page") {
      events.push(...normalizePageMessagingEntry(entry, payload));
    }

    if (object === "instagram") {
      events.push(...normalizeInstagramEntry(entry, payload));
    }

    if (object === "whatsapp_business_account") {
      events.push(...normalizeWhatsAppEntry(entry, payload));
    }
  }

  return events;
}
