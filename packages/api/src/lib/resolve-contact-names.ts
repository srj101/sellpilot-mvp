import { env } from "@acme/env";

import type { MetaConnectionRow, MetaWebhookEventRow } from "./meta-inbox";

/** A customer's display identity as Meta knows it. `avatarUrl` is a signed CDN URL that
 * expires — never persist it. It is null unless the app holds the User Profile capability
 * (see fetchContactDirect). */
export interface ResolvedContact {
  name: string | null;
  avatarUrl: string | null;
}

const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// Shortest gap between forced refreshes of a page's conversation list. Without a floor,
// a contact Meta genuinely doesn't list (an orphaned thread, say) would re-fetch the list
// on every single inbox load.
const FORCED_REFRESH_FLOOR = 1000 * 30;

// Keyed by `platform:psid`. Negative results are cached too, so a contact Meta refuses to
// resolve doesn't trigger a fresh request on every inbox load.
const contactCache = new Map<string, { contact: ResolvedContact; expiresAt: number }>();

// Keyed by page/account id — tracks which pages we've already pulled the conversation list
// for, so N conversations cost one request rather than N.
const pageLoadedAt = new Map<string, number>();

// The User Profile capability error is a property of the app, not of any one contact.
// Logged once per process instead of once per customer.
let profileCapabilityWarned = false;

const FB_VERSION = env.FACEBOOK_GRAPH_VERSION;

type MetaPlatform = "facebook_page" | "instagram";

/**
 * Resolve display names for everyone the page has an open conversation with.
 *
 * This is the path that actually works. The obvious approach — GET /{psid}?fields=name —
 * requires the User Profile capability, which an app only gets through App Review, and
 * without it every lookup returns:
 *
 *   (#3) Application does not have the capability to make this API call.
 *
 * That was why the inbox showed "Contact 2731…8960" for everyone. The conversations edge
 * needs only `pages_messaging`, returns the same names, and costs one request per page
 * instead of one per customer.
 */
async function loadPageContacts(
  platform: MetaPlatform,
  accessToken: string,
  accountId: string,
  force = false,
): Promise<void> {
  const cacheKey = `${platform}:${accountId}`;
  const loadedAt = pageLoadedAt.get(cacheKey) ?? 0;

  // A forced refresh still respects a short floor, so a burst of messages from an
  // unknown contact can't turn into a burst of identical Graph requests.
  const minAge = force ? FORCED_REFRESH_FLOOR : CACHE_TTL;
  if (loadedAt > Date.now() - minAge) {
    return;
  }

  // `participants` cannot be narrowed with a nested field set — asking for
  // participants{id,name,profile_pic} makes Graph drop the whole block and return bare
  // thread ids. Take the default shape.
  let url: string | null =
    `https://graph.facebook.com/${FB_VERSION}/me/conversations` +
    `?fields=participants&limit=100&access_token=${encodeURIComponent(accessToken)}`;

  let pages = 0;
  try {
    // Bounded: a page with thousands of threads shouldn't stall an inbox render. Older
    // conversations fall back to the short-id label until they receive a new message.
    while (url && pages < 5) {
      const res: Response = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.warn(
          `[contact-names] conversations lookup for ${platform}:${accountId} failed ` +
            `(${res.status}): ${body.slice(0, 300)}`,
        );
        return;
      }

      const data = (await res.json().catch(() => ({}))) as {
        data?: { participants?: { data?: { id?: string; name?: string }[] } }[];
        paging?: { next?: string };
      };

      for (const conversation of data.data ?? []) {
        for (const participant of conversation.participants?.data ?? []) {
          // Every thread lists the page itself alongside the customer; skip it.
          if (!participant.id || participant.id === accountId || !participant.name) {
            continue;
          }
          const key = `${platform}:${participant.id}`;
          const existing = contactCache.get(key)?.contact;
          contactCache.set(key, {
            contact: { name: participant.name, avatarUrl: existing?.avatarUrl ?? null },
            expiresAt: Date.now() + CACHE_TTL,
          });
        }
      }

      url = data.paging?.next ?? null;
      pages += 1;
    }

    pageLoadedAt.set(cacheKey, Date.now());
  } catch (err) {
    console.warn(`[contact-names] conversations lookup for ${platform}:${accountId} threw:`, err);
  }
}

/**
 * Per-customer lookup, which additionally yields a profile picture.
 *
 * Currently expected to fail with "(#3) Application does not have the capability" until the
 * app is granted the User Profile capability via App Review. It is still attempted — once
 * per contact per hour, with the failure cached — so that avatars start appearing on their
 * own the day that capability is granted, with no code change.
 */
async function fetchContactDirect(
  psid: string,
  platform: MetaPlatform,
  accessToken: string,
): Promise<ResolvedContact | null> {
  const fields = platform === "instagram" ? "name,username,profile_pic" : "name,profile_pic";
  const url = new URL(`https://graph.facebook.com/${FB_VERSION}/${psid}`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", fields);

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (body.includes("does not have the capability")) {
        if (!profileCapabilityWarned) {
          profileCapabilityWarned = true;
          console.warn(
            "[contact-names] this app lacks the User Profile capability, so profile " +
              "pictures are unavailable. Names still resolve via the conversations edge. " +
              "Request advanced access for pages_messaging in App Review to enable avatars.",
          );
        }
      } else {
        console.warn(
          `[contact-names] ${platform} profile lookup for ${psid} failed (${res.status}): ${body.slice(0, 300)}`,
        );
      }
      return null;
    }

    const data = (await res.json().catch(() => ({}))) as {
      name?: string;
      username?: string;
      profile_pic?: string;
    };
    return { name: data.name ?? data.username ?? null, avatarUrl: data.profile_pic ?? null };
  } catch (err) {
    console.warn(`[contact-names] ${platform} profile lookup for ${psid} threw:`, err);
    return null;
  }
}

async function getContact(
  psid: string,
  platform: MetaPlatform,
  accessToken: string,
  accountId: string,
): Promise<ResolvedContact | null> {
  const cacheKey = `${platform}:${psid}`;
  const now = Date.now();

  const cached = contactCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.contact;
  }

  // One request covers every contact on the page.
  await loadPageContacts(platform, accessToken, accountId);

  const hit = contactCache.get(cacheKey);
  if (hit) {
    return hit.contact;
  }

  // Not in the list. The usual reason is that the list was fetched before this person
  // first messaged — the cache is up to an hour old, and a brand new customer would stay
  // labelled "Contact 2835…4561" for that whole hour. Refresh once and look again.
  await loadPageContacts(platform, accessToken, accountId, true);

  return contactCache.get(cacheKey)?.contact ?? null;
}

/**
 * Why the per-contact profile lookup is not called from the request path.
 *
 * It cannot succeed without the User Profile capability, and the live logs made the cost
 * of trying obvious: the module-level caches above do not survive between requests in this
 * Next.js runtime, so the "attempt it once an hour" guard never held. Every inbox poll
 * re-issued one guaranteed-400 request per contact, and inbox.getInboxData took 2.3s.
 *
 * Names come from the conversations edge, which is one request per page and does work.
 * Profile pictures need App Review — request advanced access for pages_messaging, then
 * call fetchContactDirect from getContact again and avatars will populate. The plumbing
 * (ResolvedContact.avatarUrl, InboxThread.contactAvatarUrl, ContactAvatar) is already in
 * place and simply renders initials while avatarUrl stays null.
 */
export const PROFILE_PICTURES_REQUIRE_APP_REVIEW = true;

/**
 * Name-only lookup used by the worker to greet a customer by their real first name
 * (apps/worker/src/handlers/dm-reply.ts). Shares the cache with the inbox resolver, so
 * whichever runs first warms it for the other.
 *
 * WhatsApp returns null: the Cloud API has no profile lookup. Those names arrive in the
 * webhook payload instead — see extractContactLabel in meta-inbox.ts.
 */
export async function getMetaContactName(
  psid: string,
  platform: "facebook_page" | "instagram" | "whatsapp",
  accessToken: string,
  accountId?: string,
): Promise<string | null> {
  if (platform === "whatsapp") {
    return null;
  }

  const cached = contactCache.get(`${platform}:${psid}`);
  if (cached && cached.expiresAt > Date.now() && cached.contact.name) {
    return cached.contact.name;
  }

  // Without the page id we can't use the conversations edge, so fall back to the direct
  // lookup on its own.
  if (!accountId) {
    return (await fetchContactDirect(psid, platform, accessToken))?.name ?? null;
  }

  return (await getContact(psid, platform, accessToken, accountId))?.name ?? null;
}

export async function resolveContactNames(
  events: MetaWebhookEventRow[],
  connections: MetaConnectionRow[],
): Promise<Record<string, ResolvedContact>> {
  const resolved: Record<string, ResolvedContact> = {};
  const lookups: {
    psid: string;
    platform: MetaPlatform;
    accessToken: string;
    accountId: string;
  }[] = [];
  const seenKeys = new Set<string>();
  let missingToken = 0;

  for (const event of events) {
    if (event.platform !== "facebook_page" && event.platform !== "instagram") {
      continue;
    }

    // The webhook payload shape varies by event type; treated as loosely-shaped JSON.
    const rawPayload = event.rawPayload as Record<string, any>;
    const direction = rawPayload.direction as string | undefined;
    const isOutbound = direction === "outbound" || event.eventType === "outbound";

    let psid: string | undefined;

    if (isOutbound) {
      psid = (rawPayload.recipientId as string | undefined) ?? (event.sourceId ?? undefined);
    } else {
      const entry = Array.isArray(rawPayload.entry) ? rawPayload.entry : [];
      const firstEntry = entry[0] ?? {};
      const messaging = Array.isArray(firstEntry.messaging) ? firstEntry.messaging : [];
      const firstMessaging = messaging[0] ?? {};
      const sender = firstMessaging.sender ?? {};
      psid = sender.id as string | undefined;
    }

    if (!psid) {
      continue;
    }

    const cacheKey = `${event.platform}:${psid}`;
    if (seenKeys.has(cacheKey)) {
      continue;
    }
    seenKeys.add(cacheKey);

    const connection = connections.find((c) => c.id === event.metaConnectionId);
    // Page token first: PSIDs and the conversations edge are both page-scoped, so a user
    // token resolves neither.
    const accessToken = connection?.facebookPageAccessToken ?? connection?.accessToken;
    // The page's own id, needed to address the conversations edge and to tell the page
    // apart from the customer in each thread's participant list.
    const accountId =
      connection?.facebookPageId ??
      connection?.instagramBusinessAccountId ??
      connection?.platformAccountId;

    if (accessToken && accountId) {
      lookups.push({ psid, platform: event.platform, accessToken, accountId });
    } else {
      missingToken += 1;
    }
  }

  if (missingToken > 0) {
    console.warn(
      `[contact-names] ${missingToken} conversation(s) had no page token or page id on ` +
        "their meta_connection row — those fall back to a short contact id.",
    );
  }

  // Sequential rather than Promise.all: the first call warms the page-wide cache, so the
  // rest are almost always cache hits. Firing them in parallel would send the same
  // conversations request once per contact.
  for (const { psid, platform, accessToken, accountId } of lookups) {
    const contact = await getContact(psid, platform, accessToken, accountId);
    if (contact) {
      resolved[`${platform}:${psid}`] = contact;
    }
  }

  return resolved;
}
