/**
 * Rescue conversation media whose Meta CDN URL has not expired yet.
 *
 * Meta signs its media URLs with an expiry. Measured on live data: customer photos last
 * roughly 30 days, voice notes roughly 5. Only the URL was ever stored, so every file
 * older than its window is already unrecoverable — this pulls down everything still
 * reachable before the same happens to it.
 *
 * Time-critical by nature. A file skipped today may be gone tomorrow.
 *
 *   pnpm --filter @acme/api media:backfill -- --dry-run
 *   pnpm --filter @acme/api media:backfill
 */
import { asc, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { conversationMedia, metaConnection, metaWebhookEvent } from "@acme/db/schema";

import { storeMediaFromUrl } from "../lib/media-storage";

const dryRun = process.argv.includes("--dry-run");

interface Found {
  eventId: string;
  businessId: string;
  threadId: string | null;
  url: string;
  kind: "image" | "audio";
  receivedAt: Date;
  platform: string;
}

/**
 * Meta encodes the expiry two different ways: Messenger/Instagram CDN URLs use `oe` as a
 * HEX unix timestamp, WhatsApp's lookaside URLs use `ext` as a DECIMAL one. Reading only
 * the first made every WhatsApp file look like it had no expiry at all.
 */
function expiryOf(url: string): Date | null {
  const hex = /[?&]oe=([0-9A-Fa-f]+)/.exec(url);
  if (hex?.[1]) {
    const seconds = parseInt(hex[1], 16);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  }
  const dec = /[?&]ext=(\d+)/.exec(url);
  if (dec?.[1]) {
    const seconds = parseInt(dec[1], 10);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  }
  return null;
}

/** Pull every attachment URL out of a stored webhook payload, across platform shapes. */
function extractMedia(event: typeof metaWebhookEvent.$inferSelect): Found[] {
  const payload = event.rawPayload as Record<string, any>;
  const out: Found[] = [];

  const push = (url: unknown, kind: "image" | "audio") => {
    if (typeof url !== "string" || !url.startsWith("http")) return;
    out.push({
      eventId: event.id,
      businessId: event.businessId!,
      threadId: event.threadId,
      url,
      kind,
      receivedAt: event.receivedAt,
      platform: event.platform,
    });
  };

  // Messenger / Instagram
  for (const attachment of payload?.entry?.[0]?.messaging?.[0]?.message?.attachments ?? []) {
    if (attachment?.type === "image") push(attachment?.payload?.url, "image");
    if (attachment?.type === "audio") push(attachment?.payload?.url, "audio");
  }

  // WhatsApp
  for (const message of payload?.entry?.[0]?.changes?.[0]?.value?.messages ?? []) {
    if (message?.type === "image") push(message?.image?.url, "image");
    if (message?.type === "audio") push(message?.audio?.url, "audio");
  }

  return out;
}

async function main() {
  const events = await db
    .select()
    .from(metaWebhookEvent)
    .orderBy(asc(metaWebhookEvent.receivedAt));

  const candidates = events.filter((e) => e.businessId).flatMap(extractMedia);

  // Anything already rescued on an earlier run.
  const existing = new Set(
    (await db.select({ sourceUrl: conversationMedia.sourceUrl }).from(conversationMedia))
      .map((r) => r.sourceUrl)
      .filter((u): u is string => Boolean(u)),
  );

  const pending = candidates.filter((c) => !existing.has(c.url));

  // WhatsApp media downloads are authenticated. Resolve each business's token once
  // rather than per file.
  const waTokens = new Map<string, string>();
  for (const conn of await db.select().from(metaConnection).where(eq(metaConnection.platform, "whatsapp"))) {
    const token = conn.whatsappAccessToken ?? conn.accessToken;
    if (conn.businessId && token) waTokens.set(conn.businessId, token);
  }

  console.log(`${candidates.length} media reference(s) found, ${pending.length} not yet stored.\n`);

  let stored = 0;
  let expired = 0;
  let failed = 0;
  let bytes = 0;

  for (const [index, item] of pending.entries()) {
    const expiry = expiryOf(item.url);
    const label = `[${index + 1}/${pending.length}] ${item.kind} from ${item.receivedAt
      .toISOString()
      .slice(0, 10)}`;

    if (expiry && expiry.getTime() < Date.now()) {
      console.log(`${label}  ALREADY EXPIRED (${expiry.toISOString().slice(0, 10)}) — unrecoverable`);
      expired++;
      continue;
    }

    if (dryRun) {
      console.log(`${label}  would store (expires ${expiry?.toISOString().slice(0, 10) ?? "unknown"})`);
      continue;
    }

    const result = await storeMediaFromUrl({
      db,
      businessId: item.businessId,
      sourceUrl: item.url,
      kind: item.kind,
      threadId: item.threadId ?? undefined,
      messageEventId: item.eventId,
      authToken: item.platform === "whatsapp" ? waTokens.get(item.businessId) : undefined,
    });

    if (result.stored) {
      stored++;
      bytes += result.bytes;
      console.log(`${label}  stored ${(result.bytes / 1024).toFixed(0)}KB`);
    } else {
      failed++;
      console.log(`${label}  FAILED (${result.reason})`);
    }
  }

  console.log(
    `\nStored ${stored} (${(bytes / 1024 / 1024).toFixed(1)}MB), ` +
      `${expired} already expired, ${failed} failed.`,
  );
  if (dryRun) console.log("Dry run — nothing was written.");
}

await main();
