import { graphGet } from "./meta";

// Simple in-memory cache for resolved contact names to avoid calling Graph API on every page load
const contactNameCache = new Map<string, { name: string; expiresAt: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour cache TTL

const FB_VERSION = process.env.FACEBOOK_GRAPH_VERSION ?? "v25.0";

// Call Graph API safely without throwing errors to avoid console pollution in Next.js Server Components
async function safeGraphGet(psid: string, accessToken: string): Promise<string | null> {
  const url = new URL(`https://graph.facebook.com/${FB_VERSION}/${psid}`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("fields", "name");

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return null;
    }
    const data = await res.json().catch(() => ({})) as { name?: string };
    return data.name ?? null;
  } catch (err) {
    return null;
  }
}

export async function getMetaContactName(
  psid: string,
  platform: "facebook_page" | "instagram" | "whatsapp",
  accessToken: string,
): Promise<string | null> {
  const cacheKey = `${platform}:${psid}`;
  const cached = contactNameCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.name;
  }

  // If it's WhatsApp, we typically don't query the Graph API for contact names this way
  if (platform === "whatsapp") {
    return null;
  }

  const name = await safeGraphGet(psid, accessToken);
  if (name) {
    contactNameCache.set(cacheKey, {
      name,
      expiresAt: Date.now() + CACHE_TTL,
    });
    return name;
  }

  return null;
}

export async function resolveContactNames(
  events: any[],
  connections: any[],
): Promise<Record<string, string>> {
  const resolvedNames: Record<string, string> = {};
  const lookups: Array<{
    psid: string;
    platform: "facebook_page" | "instagram";
    accessToken: string;
  }> = [];
  const seenKeys = new Set<string>();

  for (const event of events) {
    if (event.platform !== "facebook_page" && event.platform !== "instagram") {
      continue;
    }

    const rawPayload = event.rawPayload || {};
    const direction = rawPayload.direction;
    const isOutbound = direction === "outbound" || event.eventType === "outbound";

    let psid: string | undefined;

    if (isOutbound) {
      psid = (rawPayload.recipientId as string) || (event.sourceId as string);
    } else {
      const entry = Array.isArray(rawPayload.entry) ? rawPayload.entry : [];
      const firstEntry = entry[0] || {};
      const messaging = Array.isArray(firstEntry.messaging)
        ? firstEntry.messaging
        : [];
      const firstMessaging = messaging[0] || {};
      const sender = firstMessaging.sender || {};
      psid = sender.id;
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
    const accessToken =
      connection?.accessToken || connection?.facebookPageAccessToken;

    if (accessToken) {
      lookups.push({ psid, platform: event.platform, accessToken });
    }
  }

  await Promise.all(
    lookups.map(async ({ psid, platform, accessToken }) => {
      const name = await getMetaContactName(psid, platform, accessToken);
      if (name) {
        resolvedNames[`${platform}:${psid}`] = name;
      }
    }),
  );

  return resolvedNames;
}
