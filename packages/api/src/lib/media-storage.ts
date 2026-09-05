/**
 * The one place conversation media is stored, counted, and released.
 *
 * Two problems, one cause. Meta's CDN URLs are signed and expire — measured against live
 * data, a customer photo lasts roughly 30 days and a voice note roughly 5 — and only the
 * URL was ever kept, so every image and voice message in every inbox was quietly
 * decaying into a broken link. Meanwhile the storage quota shown on the billing page was
 * fiction: subscription.storageUsedBytes was incremented in exactly two places, both in
 * the products router, so customer photos, voice notes, avatars and staff reply images
 * all consumed real S3 and counted for nothing.
 *
 * Accounting lives here rather than at each call site because it was already duplicated
 * inline twice and absent everywhere else. Every new media path repeated the omission.
 * One function nobody has to remember to call correctly.
 */
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { and, eq, lt, sql } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { conversationMedia, subscription } from "@acme/db/schema";

import { BUCKET_NAME, deleteS3Object, getPublicUrl, getS3ObjectSize, s3Client } from "./s3";
import { PLAN_CATALOG, type PlanKey } from "./plans";

export type MediaKind = "image" | "audio" | "avatar";

/**
 * How far past their plan a merchant may go before storing stops.
 *
 * Deliberately not 100%. A customer's incoming message is the worst possible moment to
 * enforce billing: refusing it means the merchant permanently loses that photo or voice
 * note, and a merchant who discovers their conversation history has holes in it churns
 * over something that cost us a few megabytes. The ceiling exists so a runaway account
 * still has a bound; the headroom exists so nobody loses a customer's words over it.
 */
const OVERAGE_CEILING = 1.5;

/** Meta media is small; anything past this is not a chat attachment and is refused
 * outright rather than allowed to eat a plan in one request. */
const MAX_SINGLE_FILE_BYTES = 25 * 1024 * 1024;

export type StoreMediaResult =
  | { stored: true; key: string; url: string; bytes: number; overQuota: boolean }
  | { stored: false; reason: "ceiling_reached" | "too_large" | "fetch_failed" | "empty" };

async function currentUsage(
  db: typeof Db,
  businessId: string,
): Promise<{ usedBytes: number; limitBytes: number; planKey: PlanKey }> {
  const [row] = await db
    .select({ used: subscription.storageUsedBytes, plan: subscription.plan })
    .from(subscription)
    .where(eq(subscription.businessId, businessId));

  const planKey = (row?.plan as PlanKey) ?? "starter";
  const limits = PLAN_CATALOG[planKey]?.limits ?? PLAN_CATALOG.starter.limits;
  return {
    usedBytes: row?.used ?? 0,
    limitBytes: limits.storageGb * 1024 * 1024 * 1024,
    planKey,
  };
}

/**
 * Download a file from a (soon to expire) source URL and keep our own copy.
 *
 * Returns rather than throws on every failure path: this runs while a customer is waiting
 * for a reply, and losing the media is bad but failing the whole reply over it is worse.
 */
export async function storeMediaFromUrl(params: {
  db: typeof Db;
  businessId: string;
  sourceUrl: string;
  kind: MediaKind;
  threadId?: string;
  messageEventId?: string;
  transcript?: string;
  /** Pre-fetched bytes, when the caller already downloaded the file for another reason
   * (image embedding, voice transcription) — avoids pulling it from Meta twice. */
  buffer?: Buffer;
  contentType?: string;
  /** WhatsApp's lookaside.fbsbx.com media URLs are authenticated — fetching one without
   * the connection's page/system token returns 401, not the file. Messenger and Instagram
   * CDN URLs are signed and need no header. */
  authToken?: string;
}): Promise<StoreMediaResult> {
  const { db, businessId, sourceUrl, kind } = params;

  const { usedBytes, limitBytes } = await currentUsage(db, businessId);
  if (usedBytes >= limitBytes * OVERAGE_CEILING) {
    console.warn(`[media-storage] ${businessId} is past the storage ceiling — not storing ${kind}`);
    return { stored: false, reason: "ceiling_reached" };
  }

  let buffer = params.buffer;
  let contentType = params.contentType;

  if (!buffer) {
    try {
      const res = await fetch(sourceUrl, {
        headers: params.authToken ? { Authorization: `Bearer ${params.authToken}` } : undefined,
      });
      if (!res.ok) {
        console.warn(`[media-storage] fetch failed (${res.status}) for ${kind}`);
        return { stored: false, reason: "fetch_failed" };
      }
      contentType = contentType ?? res.headers.get("content-type") ?? undefined;
      buffer = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.warn("[media-storage] fetch errored:", err);
      return { stored: false, reason: "fetch_failed" };
    }
  }

  if (buffer.byteLength === 0) return { stored: false, reason: "empty" };
  if (buffer.byteLength > MAX_SINGLE_FILE_BYTES) return { stored: false, reason: "too_large" };

  const extension = extensionFor(kind, contentType);
  const key = `conversations/${businessId}/${kind}/${crypto.randomUUID()}${extension}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType ?? "application/octet-stream",
      // Conversation media is immutable once written; a long cache is safe and keeps
      // repeat inbox renders off S3.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const bytes = buffer.byteLength;

  await db.insert(conversationMedia).values({
    businessId,
    threadId: params.threadId,
    messageEventId: params.messageEventId,
    kind,
    s3Key: key,
    bytes,
    contentType,
    sourceUrl,
    transcript: params.transcript,
  });

  await db
    .update(subscription)
    .set({ storageUsedBytes: sql`${subscription.storageUsedBytes} + ${bytes}` })
    .where(eq(subscription.businessId, businessId));

  return {
    stored: true,
    key,
    url: getPublicUrl(key),
    bytes,
    // Surfaced so the caller can warn the merchant they are over — they are not blocked,
    // but they should not find out from an invoice.
    overQuota: usedBytes + bytes > limitBytes,
  };
}

/**
 * Count a file that some other code path already uploaded to S3.
 *
 * Contact avatars go through uploadContactAvatar and staff reply images through a
 * presigned PUT — both write real bytes that were never counted, which is a large part of
 * why the storage figure on the billing page did not reflect reality. Rather than rewrite
 * those upload paths, this records what is already there.
 *
 * Idempotent on s3Key: re-recording the same object would inflate the merchant's usage
 * every time the caller ran.
 */
export async function recordExistingObject(
  db: typeof Db,
  businessId: string,
  s3Key: string,
  kind: MediaKind,
  meta: { threadId?: string; messageEventId?: string } = {},
): Promise<void> {
  const [existing] = await db
    .select({ id: conversationMedia.id })
    .from(conversationMedia)
    .where(eq(conversationMedia.s3Key, s3Key))
    .limit(1);
  if (existing) return;

  const bytes = await getS3ObjectSize(s3Key);
  if (bytes <= 0) return;

  await db.insert(conversationMedia).values({
    businessId,
    threadId: meta.threadId,
    messageEventId: meta.messageEventId,
    kind,
    s3Key,
    bytes,
  });

  await db
    .update(subscription)
    .set({ storageUsedBytes: sql`${subscription.storageUsedBytes} + ${bytes}` })
    .where(eq(subscription.businessId, businessId));
}

/** Delete a stored file and give the merchant their space back. */
export async function releaseMedia(db: typeof Db, mediaId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(conversationMedia)
    .where(eq(conversationMedia.id, mediaId))
    .limit(1);
  if (!row) return;

  // S3 first: a row without an object wastes quota, an object without a row leaks storage
  // nothing will ever clean up. The former is recoverable, the latter is not.
  await deleteS3Object(row.s3Key).catch((err) =>
    console.warn(`[media-storage] failed to delete ${row.s3Key}:`, err),
  );

  await db.delete(conversationMedia).where(eq(conversationMedia.id, mediaId));
  await db
    .update(subscription)
    .set({
      storageUsedBytes: sql`GREATEST(0, ${subscription.storageUsedBytes} - ${row.bytes})`,
    })
    .where(eq(subscription.businessId, row.businessId));
}

/**
 * Delete media older than a business's plan retention window.
 *
 * Without this the quota only ever grows, and a 3GB Starter limit becomes a wall every
 * active merchant eventually hits with no way back. PLAN_CATALOG already carries
 * conversationRetentionDays (Starter 30, Growth 182, Pro 548) and nothing used it for
 * media until now.
 */
export async function pruneExpiredMedia(
  db: typeof Db,
  businessId: string,
  planKey: PlanKey,
  limit = 200,
): Promise<{ deleted: number; bytesFreed: number }> {
  const days = PLAN_CATALOG[planKey]?.limits.conversationRetentionDays ?? 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const expired = await db
    .select({ id: conversationMedia.id, bytes: conversationMedia.bytes })
    .from(conversationMedia)
    .where(
      and(eq(conversationMedia.businessId, businessId), lt(conversationMedia.createdAt, cutoff)),
    )
    // Bounded per run so one very old business cannot monopolise a sweep.
    .limit(limit);

  let bytesFreed = 0;
  for (const row of expired) {
    await releaseMedia(db, row.id);
    bytesFreed += row.bytes;
  }

  return { deleted: expired.length, bytesFreed };
}

function extensionFor(kind: MediaKind, contentType?: string): string {
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("ogg")) return ".ogg";
  if (contentType?.includes("mp4")) return ".mp4";
  if (contentType?.includes("mpeg")) return ".mp3";
  if (contentType?.includes("wav")) return ".wav";
  return kind === "audio" ? ".ogg" : ".jpg";
}
