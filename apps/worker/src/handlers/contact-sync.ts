/**
 * Keeps the meta_contact table fresh: display names from the page's conversation list,
 * profile pictures from the per-user endpoint.
 *
 * Both run here rather than on the inbox render path. Resolving names inline used to cost
 * one Graph request per connected page on every single page load — roughly 1-2 seconds —
 * because the in-memory cache it relied on never survived between requests.
 */
import { and, eq, inArray, isNull, lt, or, sql } from "@acme/db";
import { db } from "@acme/db/client";
import { metaConnection, metaContact } from "@acme/db/schema";
import { uploadContactAvatar } from "@acme/api/s3";
import type { ContactAvatarFetchJob, ContactNameSyncJob, Job } from "@acme/queue";
import { env } from "@acme/env";

const FB_VERSION = env.FACEBOOK_GRAPH_VERSION;
const REFRESH_MS = env.CONTACT_REFRESH_DAYS * 86_400_000;

/** Page-scoped platforms. WhatsApp is excluded throughout: the Cloud API exposes no
 * profile lookup, and the customer's name already arrives inside the webhook payload. */
type SyncablePlatform = "facebook_page" | "instagram";

function isSyncable(platform: string): platform is SyncablePlatform {
  return platform === "facebook_page" || platform === "instagram";
}

async function loadConnection(connectionId: string, businessId: string) {
  const [row] = await db
    .select()
    .from(metaConnection)
    .where(and(eq(metaConnection.id, connectionId), eq(metaConnection.businessId, businessId)))
    .limit(1);
  if (!row) return null;

  // Page-scoped ids and the conversations edge both require a *page* token; a user token
  // resolves neither.
  const accessToken = row.facebookPageAccessToken ?? row.accessToken;
  const accountId =
    row.facebookPageId ?? row.instagramBusinessAccountId ?? row.platformAccountId;

  if (!accessToken || !accountId || !isSyncable(row.platform)) return null;
  return { accessToken, accountId, platform: row.platform };
}

/**
 * Pull every participant on a page and upsert their names.
 *
 * Uses /me/conversations rather than GET /{psid}?fields=name. The per-user endpoint needs
 * the User Profile capability, which requires App Review — without it every lookup returns
 * "(#3) Application does not have the capability". The conversations edge needs only
 * pages_messaging, returns the same names, and costs one request for the whole page.
 */
export async function handleContactNameSync(job: Job<ContactNameSyncJob>): Promise<void> {
  const { businessId, connectionId } = job.data;

  const connection = await loadConnection(connectionId, businessId);
  if (!connection) {
    console.warn(`[contact-sync] connection ${connectionId} is missing or has no page token — skipping`);
    return;
  }
  const { accessToken, accountId, platform } = connection;

  let url: string | null =
    `https://graph.facebook.com/${FB_VERSION}/me/conversations` +
    `?fields=participants&limit=100&access_token=${encodeURIComponent(accessToken)}`;

  const seen = new Map<string, string>();
  let pages = 0;

  // Bounded: a page with tens of thousands of threads must not pin a worker. Older
  // conversations are picked up the next time they receive a message.
  while (url && pages < 20) {
    const res: Response = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `conversations lookup for ${platform}:${accountId} failed (${res.status}): ${body.slice(0, 300)}`,
      );
    }

    const data = (await res.json().catch(() => ({}))) as {
      data?: { participants?: { data?: { id?: string; name?: string }[] } }[];
      paging?: { next?: string };
    };

    for (const conversation of data.data ?? []) {
      for (const participant of conversation.participants?.data ?? []) {
        // Every thread lists the page itself alongside the customer.
        if (!participant.id || !participant.name || participant.id === accountId) continue;
        seen.set(participant.id, participant.name);
      }
    }

    url = data.paging?.next ?? null;
    pages += 1;
  }

  if (seen.size === 0) {
    console.log(`[contact-sync] ${platform}:${accountId} returned no participants`);
    return;
  }

  const now = new Date();
  const rows = [...seen].map(([psid, name]) => ({
    businessId,
    platform,
    psid,
    name,
    nameRefreshedAt: now,
  }));

  // One statement rather than N — a busy page can carry hundreds of participants.
  await db
    .insert(metaContact)
    .values(rows)
    .onConflictDoUpdate({
      target: [metaContact.businessId, metaContact.platform, metaContact.psid],
      set: {
        name: sqlExcluded("name"),
        nameRefreshedAt: sqlExcluded("name_refreshed_at"),
        updatedAt: now,
      },
    });

  console.log(`[contact-sync] ${platform}:${accountId} — ${seen.size} contact name(s) refreshed`);

  // Newly-seen contacts have no avatar yet. Queue those, not the whole page, so a refresh
  // of 500 known contacts doesn't fan out into 500 avatar requests.
  const missing = await db
    .select({ psid: metaContact.psid })
    .from(metaContact)
    .where(
      and(
        eq(metaContact.businessId, businessId),
        eq(metaContact.platform, platform),
        inArray(metaContact.psid, [...seen.keys()]),
        isNull(metaContact.avatarS3Key),
      ),
    );

  if (missing.length > 0) {
    await enqueueAvatarFetches(businessId, connectionId, platform, missing.map((m) => m.psid));
  }
}

/**
 * Download one contact's profile picture into S3.
 *
 * Expected to fail with "(#3) Application does not have the capability" until App Review
 * grants advanced access for pages_messaging. That is treated as a normal outcome, not an
 * error: the row keeps a null avatar and the inbox renders initials, which is what
 * ContactAvatar already does.
 */
export async function handleContactAvatarFetch(job: Job<ContactAvatarFetchJob>): Promise<void> {
  const { businessId, connectionId, platform, psid } = job.data;

  const connection = await loadConnection(connectionId, businessId);
  if (!connection) return;

  const url = new URL(`https://graph.facebook.com/${FB_VERSION}/${psid}`);
  url.searchParams.set("access_token", connection.accessToken);
  url.searchParams.set("fields", "profile_pic");

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (body.includes("does not have the capability")) {
      warnCapabilityOnce();
      return;
    }
    // Anything else is worth surfacing, but an avatar is cosmetic — never fail the job in a
    // way that retries forever.
    console.warn(`[contact-sync] avatar lookup for ${psid} failed (${res.status}): ${body.slice(0, 200)}`);
    return;
  }

  const { profile_pic: profilePic } = (await res.json().catch(() => ({}))) as {
    profile_pic?: string;
  };
  if (!profilePic) return;

  const [existing] = await db
    .select({ avatarHash: metaContact.avatarHash })
    .from(metaContact)
    .where(
      and(
        eq(metaContact.businessId, businessId),
        eq(metaContact.platform, platform),
        eq(metaContact.psid, psid),
      ),
    )
    .limit(1);

  const uploaded = await uploadContactAvatar({
    businessId,
    platform,
    psid,
    imageUrl: profilePic,
    previousHash: existing?.avatarHash,
  });
  if (!uploaded) return;

  await db
    .update(metaContact)
    .set({
      avatarS3Key: uploaded.key,
      avatarHash: uploaded.hash,
      avatarRefreshedAt: new Date(),
    })
    .where(
      and(
        eq(metaContact.businessId, businessId),
        eq(metaContact.platform, platform),
        eq(metaContact.psid, psid),
      ),
    );

  if (uploaded.changed) {
    console.log(`[contact-sync] avatar stored for ${platform}:${psid}`);
  }
}

/**
 * Periodic sweep: re-sync any page whose names have gone stale, and re-fetch avatars past
 * their refresh window. Self-rescheduling in the same style as the billing sweeps.
 */
export async function runContactRefreshSweep(): Promise<void> {
  const cutoff = new Date(Date.now() - REFRESH_MS);

  const connections = await db
    .select({
      id: metaConnection.id,
      businessId: metaConnection.businessId,
      platform: metaConnection.platform,
    })
    .from(metaConnection);

  let queuedPages = 0;
  for (const connection of connections) {
    if (!isSyncable(connection.platform) || !connection.businessId) continue;

    const [stale] = await db
      .select({ psid: metaContact.psid })
      .from(metaContact)
      .where(
        and(
          eq(metaContact.businessId, connection.businessId),
          eq(metaContact.platform, connection.platform),
          or(isNull(metaContact.nameRefreshedAt), lt(metaContact.nameRefreshedAt, cutoff)),
        ),
      )
      .limit(1);

    // No stale contact means the whole page was refreshed inside the window; one request
    // covers every contact, so a single hit is enough to justify syncing it.
    if (!stale) continue;

    await enqueueNameSync(connection.businessId, connection.id);
    queuedPages += 1;
  }

  const staleAvatars = await db
    .select({
      businessId: metaContact.businessId,
      platform: metaContact.platform,
      psid: metaContact.psid,
    })
    .from(metaContact)
    .where(or(isNull(metaContact.avatarRefreshedAt), lt(metaContact.avatarRefreshedAt, cutoff)))
    // Avatars are one request each, so cap how many a single sweep can queue.
    .limit(200);

  console.log(
    `[contact-sync] sweep queued ${queuedPages} page name sync(s) and ${staleAvatars.length} avatar fetch(es)`,
  );

  for (const row of staleAvatars) {
    if (!isSyncable(row.platform)) continue;
    const [connection] = await db
      .select({ id: metaConnection.id })
      .from(metaConnection)
      .where(
        and(
          eq(metaConnection.businessId, row.businessId),
          eq(metaConnection.platform, row.platform),
        ),
      )
      .limit(1);
    if (!connection) continue;
    await enqueueAvatarFetches(row.businessId, connection.id, row.platform, [row.psid]);
  }
}

// --- wiring injected by apps/worker/src/index.ts -----------------------------------
// The handlers need to enqueue follow-up jobs, but importing the queue here would create a
// cycle with index.ts. Same dependency-injection shape the other handlers use.

type NameSyncEnqueue = (businessId: string, connectionId: string) => Promise<void>;
type AvatarEnqueue = (
  businessId: string,
  connectionId: string,
  platform: SyncablePlatform,
  psids: string[],
) => Promise<void>;

let enqueueNameSyncFn: NameSyncEnqueue = async () => undefined;
let enqueueAvatarFetchesFn: AvatarEnqueue = async () => undefined;

export function setContactSyncEnqueuers(fns: {
  nameSync: NameSyncEnqueue;
  avatarFetch: AvatarEnqueue;
}): void {
  enqueueNameSyncFn = fns.nameSync;
  enqueueAvatarFetchesFn = fns.avatarFetch;
}

const enqueueNameSync: NameSyncEnqueue = (b, c) => enqueueNameSyncFn(b, c);
const enqueueAvatarFetches: AvatarEnqueue = (b, c, p, ids) => enqueueAvatarFetchesFn(b, c, p, ids);

// The capability error is a property of the app, not of any one contact — log it once
// rather than once per customer.
let capabilityWarned = false;
function warnCapabilityOnce() {
  if (capabilityWarned) return;
  capabilityWarned = true;
  console.warn(
    "[contact-sync] this app lacks the User Profile capability, so profile pictures are " +
      "unavailable and the inbox will show initials. Names are unaffected. Request advanced " +
      "access for pages_messaging in App Review to enable avatars.",
  );
}

/** drizzle has no `excluded` helper on onConflictDoUpdate, so reference it by column name. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}
