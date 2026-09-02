import { and, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { metaContact } from "@acme/db/schema";

import type { MetaConnectionRow, MetaWebhookEventRow } from "./meta-inbox";
import { getPublicUrl } from "./s3";

/** A customer's display identity. Both fields are read from the meta_contact table — this
 * module never calls the Graph API. Syncing is the worker's job (contact-name-sync and
 * contact-avatar-fetch), deliberately kept off the render path. */
export interface ResolvedContact {
  name: string | null;
  avatarUrl: string | null;
}

export type MetaPlatform = "facebook_page" | "instagram" | "whatsapp";

/**
 * Extract the customer's platform-scoped id from a webhook event — the sender on an
 * inbound message, the recipient on an outbound one.
 *
 * Exported because the webhook route needs the same answer when deciding whether a contact
 * is new and a sync should be queued. Two implementations of this would drift.
 */
export function extractEventPsid(event: MetaWebhookEventRow): string | null {
  // The payload shape varies by event type; treated as loosely-shaped JSON.
  const rawPayload = event.rawPayload as Record<string, any>;
  const direction = rawPayload.direction as string | undefined;
  const isOutbound = direction === "outbound" || event.eventType === "outbound";

  if (isOutbound) {
    return (rawPayload.recipientId as string | undefined) ?? event.sourceId ?? null;
  }

  const entry = Array.isArray(rawPayload.entry) ? rawPayload.entry : [];
  const messaging = Array.isArray(entry[0]?.messaging) ? entry[0].messaging : [];
  return (messaging[0]?.sender?.id as string | undefined) ?? null;
}

/**
 * Look up display names and avatars for everyone appearing in these events.
 *
 * One indexed query, no network. The previous version called the Graph API on every inbox
 * render — one request per connected page, 1-2 seconds — because its in-memory cache never
 * survived between requests in this runtime.
 *
 * A contact with no row yet simply isn't in the returned map, and the caller falls back to
 * a shortened id until the sync job fills it in.
 */
export async function resolveContactNames(
  events: MetaWebhookEventRow[],
  connections: MetaConnectionRow[],
): Promise<Record<string, ResolvedContact>> {
  const businessIds = [...new Set(connections.map((c) => c.businessId).filter(Boolean))];
  if (businessIds.length === 0) {
    return {};
  }

  const psids = new Set<string>();
  for (const event of events) {
    const psid = extractEventPsid(event);
    if (psid) {
      psids.add(psid);
    }
  }
  if (psids.size === 0) {
    return {};
  }

  const rows = await db
    .select({
      platform: metaContact.platform,
      psid: metaContact.psid,
      name: metaContact.name,
      avatarS3Key: metaContact.avatarS3Key,
    })
    .from(metaContact)
    .where(
      and(
        inArray(metaContact.businessId, businessIds),
        inArray(metaContact.psid, [...psids]),
      ),
    );

  const resolved: Record<string, ResolvedContact> = {};
  for (const row of rows) {
    if (!row.name && !row.avatarS3Key) {
      continue;
    }
    resolved[`${row.platform}:${row.psid}`] = {
      name: row.name,
      avatarUrl: row.avatarS3Key ? getPublicUrl(row.avatarS3Key) : null,
    };
  }
  return resolved;
}

/**
 * Name-only lookup for a single contact, used by the worker to greet a customer by their
 * real first name (apps/worker/src/handlers/dm-reply.ts).
 *
 * Returns null when the contact hasn't been synced yet rather than fetching inline — the
 * greeting is a nicety, and blocking a customer's reply on a Graph call to add their first
 * name is the wrong trade. The sync job will have it before their next message.
 */
export async function getMetaContactName(
  businessId: string,
  platform: MetaPlatform,
  psid: string,
): Promise<string | null> {
  const [row] = await db
    .select({ name: metaContact.name })
    .from(metaContact)
    .where(
      and(
        eq(metaContact.businessId, businessId),
        eq(metaContact.platform, platform),
        eq(metaContact.psid, psid),
      ),
    )
    .limit(1);

  return row?.name ?? null;
}
