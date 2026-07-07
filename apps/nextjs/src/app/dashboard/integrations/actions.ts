"use server";

import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { and, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { metaConnection } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { env } from "~/env";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getWhatsAppAccounts,
  getWhatsAppPhoneNumbers,
  subscribeInstagramWebhooks,
  subscribeMetaPageWebhooks,
  subscribeWhatsAppWebhooks,
} from "~/lib/meta";

const FB_VERSION = env.FACEBOOK_GRAPH_VERSION;

function getDefaultHostAndProto() {
  let host = "localhost:3000";
  let protocol = "http";
  if (env.BETTER_AUTH_URL) {
    try {
      const parsed = new URL(env.BETTER_AUTH_URL);
      host = parsed.host;
      protocol = parsed.protocol.replace(":", "");
    } catch {
      // Keep localhost defaults when BETTER_AUTH_URL is not a valid URL.
    }
  }
  return { host, protocol };
}

// ---------------------------------------------------------------------------
// Connect a Meta channel (Facebook Page, Instagram, or WhatsApp WABA)
// ---------------------------------------------------------------------------

type Channel = "facebook" | "instagram" | "whatsapp";

function asChannel(value: unknown): Channel {
  return value === "facebook" || value === "instagram" || value === "whatsapp"
    ? value
    : "facebook";
}

async function replaceWhatsAppConnection(input: {
  userId: string;
  wabaId: string;
  phoneNumberId?: string;
  displayPhoneName: string;
  verifiedName: string;
  displayPhoneNumber: string;
  accessToken: string;
  expiresIn?: number;
}) {
  const lookupIds = [input.phoneNumberId, input.wabaId].filter(
    (value): value is string => Boolean(value),
  );

  const existing = await db
    .select()
    .from(metaConnection)
    .where(
      and(
        eq(metaConnection.userId, input.userId),
        eq(metaConnection.platform, "whatsapp"),
        inArray(metaConnection.platformAccountId, lookupIds),
      ),
    )
    .limit(1);

  const values = {
    platformAccountName: input.displayPhoneName,
    whatsappBusinessAccountId: input.wabaId,
    whatsappPhoneNumberId: input.phoneNumberId,
    whatsappAccessToken: input.accessToken,
    accessToken: input.accessToken,
    accessTokenExpiresAt: input.expiresIn
      ? new Date(Date.now() + input.expiresIn * 1000)
      : null,
    metadata: {
      phone_number_id: input.phoneNumberId,
      verified_name: input.verifiedName,
      display_phone_number: input.displayPhoneNumber,
    },
    webhookSubscriptionStatus: "not_required",
    webhookSubscribedAt: new Date(),
    webhookSubscriptionError: null,
  } as const;

  if (existing[0]) {
    await db
      .update(metaConnection)
      .set(values)
      .where(eq(metaConnection.id, existing[0].id));
    return;
  }

  await db.insert(metaConnection).values({
    userId: input.userId,
    platform: "whatsapp",
    platformAccountId: input.phoneNumberId ?? input.wabaId,
    ...values,
  });
}

async function replaceMetaSelection(input: {
  userId: string;
  intent: "facebook" | "instagram";
  pageId: string;
  pageName: string;
  pageToken: string;
  instagramId?: string;
  instagramUsername?: string;
  instagramProfilePictureUrl?: string;
}) {
  const webhookSubscription = await (input.intent === "facebook"
    ? subscribeMetaPageWebhooks(input.pageId, input.pageToken)
    : subscribeInstagramWebhooks(input.pageId, input.pageToken));

  await db
    .delete(metaConnection)
    .where(
      and(
        eq(metaConnection.userId, input.userId),
        eq(
          metaConnection.platform,
          input.intent === "facebook" ? "facebook_page" : "instagram",
        ),
      ),
    );

  if (input.intent === "facebook") {
    await db.insert(metaConnection).values({
      userId: input.userId,
      platform: "facebook_page",
      platformAccountId: input.pageId,
      platformAccountName: input.pageName,
      facebookPageId: input.pageId,
      facebookPageName: input.pageName,
      facebookPageAccessToken: input.pageToken,
      accessToken: input.pageToken,
      webhookSubscriptionStatus: webhookSubscription.success
        ? "subscribed"
        : "failed",
      webhookSubscribedAt: webhookSubscription.success ? new Date() : null,
      webhookSubscriptionError: null,
    });
    return;
  }

  if (!input.instagramId) {
    redirect("/dashboard/integrations?error=no_instagram_account");
  }

  await db.insert(metaConnection).values({
    userId: input.userId,
    platform: "instagram",
    platformAccountId: input.instagramId,
    platformAccountName: input.instagramUsername,
    facebookPageId: input.pageId,
    facebookPageName: input.pageName,
    facebookPageAccessToken: input.pageToken,
    instagramBusinessAccountId: input.instagramId,
    instagramUsername: input.instagramUsername,
    accessToken: input.pageToken,
    metadata: {
      profile_picture_url: input.instagramProfilePictureUrl || null,
      facebook_page_id: input.pageId,
    },
    webhookSubscriptionStatus: webhookSubscription.success
      ? "subscribed"
      : "failed",
    webhookSubscribedAt: webhookSubscription.success ? new Date() : null,
    webhookSubscriptionError: null,
  });
}

async function persistWhatsAppSignup(input: {
  userId: string;
  code: string;
  redirectUri: string;
  wabaId?: string;
  phoneNumberId?: string;
}) {
  const tokenData = await exchangeCodeForToken(input.code, input.redirectUri);

  if (!tokenData.access_token) {
    return { ok: false, error: "No access token returned" };
  }

  const longToken = await exchangeForLongLivedToken(tokenData.access_token);

  let wabaId = input.wabaId;
  let phoneNumberId = input.phoneNumberId;

  if (!wabaId) {
    try {
      const accounts = await getWhatsAppAccounts(longToken.access_token);
      if (accounts?.[0]) {
        wabaId = accounts[0].id;
        console.log("[persistWhatsAppSignup] Resolved missing wabaId:", wabaId);
      }
    } catch (err) {
      console.error("Failed to fetch direct WhatsApp business accounts:", err);
    }
  }

  if (wabaId && !phoneNumberId) {
    try {
      const phoneNumbers = await getWhatsAppPhoneNumbers(wabaId, longToken.access_token);
      if (phoneNumbers.data?.[0]) {
        phoneNumberId = phoneNumbers.data[0].id;
        console.log("[persistWhatsAppSignup] Resolved missing phoneNumberId:", phoneNumberId);
      }
    } catch (err) {
      console.error("Failed to fetch phone numbers for resolved WABA:", err);
    }
  }

  let displayPhoneName = "WhatsApp Business";
  let verifiedName = "";
  let displayPhoneNumber = "";

  if (wabaId) {
    try {
      const phoneNumbers = await getWhatsAppPhoneNumbers(
        wabaId,
        longToken.access_token,
      );
      const mainNumber =
        phoneNumbers.data.find((entry) => entry.id === phoneNumberId) ??
        phoneNumbers.data[0];

      if (mainNumber) {
        verifiedName = mainNumber.verified_name;
        displayPhoneNumber = mainNumber.display_phone_number;
        displayPhoneName = `${mainNumber.verified_name} (${mainNumber.display_phone_number})`;
      }
    } catch (err) {
      console.error("Failed to fetch WhatsApp phone details:", err);
    }
  }

  if (wabaId) {
    await replaceWhatsAppConnection({
      userId: input.userId,
      wabaId,
      phoneNumberId,
      displayPhoneName,
      verifiedName,
      displayPhoneNumber,
      accessToken: longToken.access_token,
      expiresIn: longToken.expires_in,
    });
  }

  return { ok: true };
}

/**
 * Server action: Routes the user to the right Meta OAuth flow for the
 * selected channel. Sets a short-lived `meta_channel_intent` cookie so the
 * callback and the selection page know which platform to scope to.
 *
 * - facebook / instagram → Facebook OAuth Dialog (page-level token)
 * - whatsapp             → WhatsApp Embedded Signup is client-driven; this
 *                          branch just bounces back to the integrations page.
 */
export async function connectChannel(formData: FormData) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const channel = asChannel(formData.get("channel"));

  const state = crypto.randomBytes(24).toString("hex");
  const cookieStore = await cookies();

  cookieStore.set("meta_channel_intent", channel, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 10 * 60, // 10 minutes
    path: "/",
  });

  cookieStore.set("meta_channel_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 10 * 60, // 10 minutes
    path: "/",
  });

  const headersList = await headers();
  const defaultUrl = getDefaultHostAndProto();
  const host =
    headersList.get("x-forwarded-host") ??
    headersList.get("host") ??
    defaultUrl.host;
  const protocol = headersList.get("x-forwarded-proto") ?? defaultUrl.protocol;

  const redirectUri =
    env.META_CHANNEL_REDIRECT_URI ?? `${protocol}://${host}/api/meta/callback`;

  const url = new URL(`https://www.facebook.com/${FB_VERSION}/dialog/oauth`);

  url.searchParams.set("client_id", env.FACEBOOK_APP_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  if (channel === "whatsapp") {
    const configId = env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID;
    if (configId) {
      url.searchParams.set("config_id", configId);
    }
  } else {
    url.searchParams.set(
      "scope",
      [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_metadata",
        "pages_messaging",
        "instagram_basic",
        "instagram_manage_messages",
      ].join(","),
    );
  }

  redirect(url.toString());
}

// ---------------------------------------------------------------------------
// Disconnect a channel
// ---------------------------------------------------------------------------

/**
 * Server action: Removes a meta_connection row by ID, only if it belongs
 * to the current user.
 */
export async function disconnectChannel(connectionId: string) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  await db
    .delete(metaConnection)
    .where(
      and(
        eq(metaConnection.id, connectionId),
        eq(metaConnection.userId, session.user.id),
      ),
    );

  redirect("/dashboard/integrations");
}

// ---------------------------------------------------------------------------
// Complete WhatsApp Embedded Signup
// ---------------------------------------------------------------------------

/**
 * Server action: Called from the WhatsApp Embedded Signup client component.
 * Exchanges the code for an access token and saves the WABA connection.
 */
export async function completeWhatsAppSignup(input: {
  code: string;
  redirectUri: string;
  wabaId?: string;
  phoneNumberId?: string;
}) {
  const session = await getSession();
  if (!session?.user) {
    return { ok: false, error: "Not authenticated" };
  }

  try {
    return await persistWhatsAppSignup({
      userId: session.user.id,
      code: input.code,
      redirectUri: input.redirectUri,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
    });
  } catch (err) {
    console.error("WhatsApp signup error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Server action: Saves the user-selected account(s) for the channel in
 * `meta_channel_intent` (facebook | instagram | whatsapp), and removes the
 * temporary token cookie.
 *
 * - facebook  → save only the facebook_page row, drop any instagram row
 * - instagram → save only the instagram row (uses the linked Page token),
 *               drop the facebook_page row
 * - whatsapp  → not handled here (Embedded Signup path)
 */
export async function saveSelectedPage(formData: FormData) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const tempToken = cookieStore.get("meta_temp_user_token")?.value;
  const intent = asChannel(cookieStore.get("meta_channel_intent")?.value);

  if (!tempToken) {
    redirect("/dashboard/integrations?error=session_expired");
  }

  if (intent === "whatsapp") {
    const wabaId = formData.get("wabaId") as string;
    const wabaName = formData.get("wabaName") as string;
    const phoneNumberId = formData.get("phoneNumberId") as string;
    const phoneNumber = formData.get("phoneNumber") as string;

    if (!wabaId || !phoneNumberId) {
      redirect("/dashboard/integrations?error=invalid_selection");
    }

    try {
      const longToken = await exchangeForLongLivedToken(tempToken);
      const finalToken = longToken.access_token || tempToken;
      await subscribeWhatsAppWebhooks(wabaId, finalToken);
      await replaceWhatsAppConnection({
        userId: session.user.id,
        wabaId,
        phoneNumberId,
        displayPhoneName: wabaName,
        verifiedName: wabaName,
        displayPhoneNumber: phoneNumber,
        accessToken: finalToken,
        expiresIn: longToken.expires_in,
      });

      cookieStore.delete("meta_temp_user_token");
      cookieStore.delete("meta_channel_intent");
      cookieStore.delete("meta_channel_state");
    } catch (err) {
      console.error("Failed to save selected Meta connections:", err);
      redirect("/dashboard/integrations?error=save_failed");
    }

    redirect("/dashboard/integrations?connected=whatsapp");
  }

  const pageId = formData.get("pageId") as string;
  const pageName = formData.get("pageName") as string;
  const pageAccessToken = formData.get("pageAccessToken") as string;
  const instagramId = formData.get("instagramId") as string;
  const instagramUsername = formData.get("instagramUsername") as string;
  const instagramProfilePictureUrl = formData.get(
    "instagramProfilePictureUrl",
  ) as string;

  if (!pageId || !pageAccessToken) {
    redirect("/dashboard/integrations?error=invalid_selection");
  }

  try {
    const longToken = await exchangeForLongLivedToken(pageAccessToken);
    const finalPageToken = longToken.access_token || pageAccessToken;
    await replaceMetaSelection({
      userId: session.user.id,
      intent,
      pageId,
      pageName,
      pageToken: finalPageToken,
      instagramId,
      instagramUsername,
      instagramProfilePictureUrl,
    });

    // Clean up cookies
    cookieStore.delete("meta_temp_user_token");
    cookieStore.delete("meta_channel_intent");
    cookieStore.delete("meta_channel_state");
  } catch (err) {
    console.error("Failed to save selected Meta connections:", err);
    redirect("/dashboard/integrations?error=save_failed");
  }

  redirect(
    `/dashboard/integrations?connected=${intent === "facebook" ? "facebook" : "instagram"}`,
  );
}
