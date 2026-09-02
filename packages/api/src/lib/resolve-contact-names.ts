import { env } from "@acme/env";

import type { MetaConnectionRow, MetaWebhookEventRow } from "./meta-inbox";

/** A customer's display identity as Meta knows it. `avatarUrl` is a signed CDN URL
 * that expires — never persist it, always fetch alongside the name. */
export interface ResolvedContact {
  name: string | null;
  avatarUrl: string | null;
}

// Resolved contacts are cached in memory so a page load doesn't hit the Graph API once
// per conversation. Keyed by platform:psid.
const contactCache = new Map<string, { contact: ResolvedContact; expiresAt: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

const FB_VERSION = env.FACEBOOK_GRAPH_VERSION;

/**
 * Fetch a customer's name and profile picture from the Graph API.
 *
 * This used to swallow every failure and return null with no logging, on the assumption
 * that the only cause was a deleted or blocked user. It isn't — a missing `pages_messaging`
 * permission, an app still in Development mode, and a User token used where a Page token is
 * required all fail here too, and all looked identical from the outside. That is why the
 * inbox showed "Contact 2731…8960" with no way to find out why. The failure is still
 * non-fatal (the caller falls back to a short id), but it now says what went wrong.
 */
async function fetchContact(
  psid: string,
  platform: "facebook_page" | "instagram",
  accessToken: string,
): Promise<ResolvedContact | null> {
  // profile_pic comes from the same call as name, so showing an avatar costs no extra
  // request. Instagram additionally exposes `username`, which is a better fallback than a
  // numeric id when the display name is unavailable.
  const fields =
    platform === "instagram" ? "name,username,profile_pic" : "name,profile_pic";

  const url = new URL(`https://graph.facebook.com/${FB_VERSION}/${psid}`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", fields);

  try {
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[contact-names] ${platform} lookup for ${psid} failed (${res.status}): ${body.slice(0, 300)}`,
      );
      return null;
    }

    const data = (await res.json().catch(() => ({}))) as {
      name?: string;
      username?: string;
      profile_pic?: string;
    };

    const name = data.name ?? data.username ?? null;
    if (!name && !data.profile_pic) {
      // A 200 with neither field means the token lacks the permission that would have
      // populated them, rather than the person being unreachable.
      console.warn(
        `[contact-names] ${platform} lookup for ${psid} returned no name or picture — ` +
          "the page token is probably missing pages_messaging, or the app has not passed App Review.",
      );
      return null;
    }

    return { name, avatarUrl: data.profile_pic ?? null };
  } catch (err) {
    console.warn(`[contact-names] ${platform} lookup for ${psid} threw:`, err);
    return null;
  }
}

async function getContact(
  psid: string,
  platform: "facebook_page" | "instagram",
  accessToken: string,
): Promise<ResolvedContact | null> {
  const cacheKey = `${platform}:${psid}`;
  const cached = contactCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.contact;
  }

  const contact = await fetchContact(psid, platform, accessToken);
  if (contact) {
    contactCache.set(cacheKey, { contact, expiresAt: Date.now() + CACHE_TTL });
  }
  return contact;
}

/**
 * Name-only lookup, used by the worker to greet a customer by their real first name
 * (apps/worker/src/handlers/dm-reply.ts). Shares the cache with the inbox resolver below,
 * so whichever runs first warms it for the other.
 *
 * WhatsApp returns null: the Cloud API exposes no profile lookup. The customer's name
 * arrives in the webhook payload itself instead — see extractContactLabel in meta-inbox.ts.
 */
export async function getMetaContactName(
  psid: string,
  platform: "facebook_page" | "instagram" | "whatsapp",
  accessToken: string,
): Promise<string | null> {
  if (platform === "whatsapp") {
    return null;
  }
  const contact = await getContact(psid, platform, accessToken);
  return contact?.name ?? null;
}

export async function resolveContactNames(
  events: MetaWebhookEventRow[],
  connections: MetaConnectionRow[],
): Promise<Record<string, ResolvedContact>> {
  const resolved: Record<string, ResolvedContact> = {};
  const lookups: {
    psid: string;
    platform: "facebook_page" | "instagram";
    accessToken: string;
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
    // Page access token first: PSIDs are page-scoped, so a User token cannot resolve them.
    // The previous order preferred `accessToken`, which silently produced empty results
    // whenever that column held a user token rather than a page one.
    const accessToken = connection?.facebookPageAccessToken ?? connection?.accessToken;

    if (accessToken) {
      lookups.push({ psid, platform: event.platform, accessToken });
    } else {
      missingToken += 1;
    }
  }

  if (missingToken > 0) {
    console.warn(
      `[contact-names] ${missingToken} conversation(s) had no page access token on their ` +
        "meta_connection row — those will fall back to a short contact id.",
    );
  }

  await Promise.all(
    lookups.map(async ({ psid, platform, accessToken }) => {
      const contact = await getContact(psid, platform, accessToken);
      if (contact) {
        resolved[`${platform}:${psid}`] = contact;
      }
    }),
  );

  return resolved;
}
