"use server";

import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { and, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { member, metaConnection, organization } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { env } from "~/env";
import {
  exchangeForLongLivedToken,
  subscribeInstagramWebhooks,
  subscribeMetaPageWebhooks,
  subscribeWhatsAppWebhooks,
} from "@acme/api/meta";

const FB_VERSION = env.FACEBOOK_GRAPH_VERSION;

// These are plain Server Actions (see comment below), not tRPC procedures, so they don't
// get orgProcedure's automatic organizationId resolution — this mirrors that same lookup
// (URL slug -> real membership row), never trusting the slug alone.
async function resolveOrganizationId(userId: string, storeSlug: string): Promise<string> {
  const [org] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, storeSlug))
    .limit(1);
  if (!org) throw new Error("Store not found");

  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, org.id), eq(member.userId, userId)))
    .limit(1);
  if (!membership) throw new Error("You don't have access to this store.");

  return org.id;
}

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
//
// This — and saveSelectedPage below — must stay as a Server Action rather
// than a tRPC procedure: both need to set/read short-lived httpOnly cookies
// (CSRF state, OAuth intent, temp user token) tied directly to the redirect
// response, the same reason the Meta OAuth callback route stays a plain
// Route Handler. Everything else in this domain (disconnect, WhatsApp
// signup/session management) has moved to packages/api's integrations router.
// ---------------------------------------------------------------------------

type Channel = "facebook" | "instagram" | "whatsapp";

function asChannel(value: unknown): Channel {
  return value === "facebook" || value === "instagram" || value === "whatsapp"
    ? value
    : "facebook";
}

async function replaceWhatsAppConnection(input: {
  userId: string;
  organizationId: string;
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
        eq(metaConnection.organizationId, input.organizationId),
        eq(metaConnection.platform, "whatsapp"),
        inArray(metaConnection.platformAccountId, lookupIds),
      ),
    )
    .limit(1);

  let webhookSubscriptionStatus = "failed";
  let webhookSubscriptionError: string | null = null;
  try {
    const res = await subscribeWhatsAppWebhooks(input.wabaId, input.accessToken);
    if (res.success) {
      webhookSubscriptionStatus = "subscribed";
    }
  } catch (error: any) {
    webhookSubscriptionError = error instanceof Error ? error.message : String(error);
  }

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
    webhookSubscriptionStatus,
    webhookSubscribedAt: webhookSubscriptionStatus === "subscribed" ? new Date() : null,
    webhookSubscriptionError,
  };

  if (existing[0]) {
    await db
      .update(metaConnection)
      .set(values)
      .where(eq(metaConnection.id, existing[0].id));
    return;
  }

  await db.insert(metaConnection).values({
    userId: input.userId,
    organizationId: input.organizationId,
    platform: "whatsapp",
    platformAccountId: input.phoneNumberId ?? input.wabaId,
    ...values,
  });
}

async function replaceMetaSelection(input: {
  userId: string;
  organizationId: string;
  intent: "facebook" | "instagram";
  pageId: string;
  pageName: string;
  pageToken: string;
  instagramId?: string;
  instagramUsername?: string;
  instagramProfilePictureUrl?: string;
  storeSlug: string;
}) {
  // Webhook subscription is best-effort — a Graph API error here (e.g. a
  // permission not yet approved) must not block saving the Page/account
  // connection itself. Surface the failure via webhookSubscriptionError
  // instead of throwing.
  let webhookSubscribed = false;
  let webhookError: string | null = null;
  try {
    const result = await (input.intent === "facebook"
      ? subscribeMetaPageWebhooks(input.pageId, input.pageToken)
      : subscribeInstagramWebhooks(input.pageId, input.pageToken));
    webhookSubscribed = result.success;
  } catch (err) {
    console.error("Failed to subscribe Meta webhooks:", err);
    webhookError = err instanceof Error ? err.message : "Webhook subscription failed";
  }

  // Upsert (not delete-then-insert) so a user can connect multiple distinct
  // Pages/accounts at once — re-selecting the same one just refreshes its token.
  if (input.intent === "facebook") {
    const values = {
      userId: input.userId,
      organizationId: input.organizationId,
      platform: "facebook_page" as const,
      platformAccountId: input.pageId,
      platformAccountName: input.pageName,
      facebookPageId: input.pageId,
      facebookPageName: input.pageName,
      facebookPageAccessToken: input.pageToken,
      accessToken: input.pageToken,
      webhookSubscriptionStatus: webhookSubscribed ? "subscribed" : "failed",
      webhookSubscribedAt: webhookSubscribed ? new Date() : null,
      webhookSubscriptionError: webhookError,
    };
    await db
      .insert(metaConnection)
      .values(values)
      .onConflictDoUpdate({
        target: [
          metaConnection.organizationId,
          metaConnection.platform,
          metaConnection.platformAccountId,
        ],
        set: { ...values, updatedAt: new Date() },
      });
    return;
  }

  if (!input.instagramId) {
    redirect(`/${input.storeSlug}/dashboard/integrations/instagram?error=no_instagram_account`);
  }

  const values = {
    userId: input.userId,
    organizationId: input.organizationId,
    platform: "instagram" as const,
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
    webhookSubscriptionStatus: webhookSubscribed ? "subscribed" : "failed",
    webhookSubscribedAt: webhookSubscribed ? new Date() : null,
    webhookSubscriptionError: webhookError,
  };
  await db
    .insert(metaConnection)
    .values(values)
    .onConflictDoUpdate({
      target: [
        metaConnection.organizationId,
        metaConnection.platform,
        metaConnection.platformAccountId,
      ],
      set: { ...values, updatedAt: new Date() },
    });
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
  const reauth = formData.get("reauth") === "1";

  const state = crypto.randomBytes(24).toString("hex");
  const cookieStore = await cookies();

  // This flow round-trips through Facebook's OAuth dialog and an external callback
  // route (/api/meta/callback, not under [storeSlug]) before landing back on a
  // store-scoped page — the store slug has to survive that trip the same way the
  // channel intent already does: as a short-lived cookie, not a URL param Facebook
  // would just drop.
  const storeSlug = (await headers()).get("x-store-slug");
  if (storeSlug) {
    cookieStore.set("meta_channel_store_slug", storeSlug, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: 10 * 60,
      path: "/",
    });
  }

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

  if (reauth) {
    // Forces Facebook to show the login dialog again instead of silently
    // reusing the current browser session — lets the user switch accounts.
    url.searchParams.set("auth_type", "reauthenticate");
  }

  if (channel === "whatsapp") {
    const configId = env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID;
    if (configId) {
      url.searchParams.set("config_id", configId);
    }
  } else {
    // This app uses "Facebook Login for Business", which resolves permissions
    // via a Configuration rather than a raw `scope` param — a bare `scope`
    // list is rejected with "Invalid Scopes" for any permission not already
    // implicitly granted. The Configuration (created in the Meta dashboard
    // under Facebook Login for Business > Configurations) must include:
    // pages_show_list, pages_read_engagement, pages_manage_metadata,
    // pages_messaging, instagram_basic, instagram_manage_messages,
    // pages_manage_posts, pages_manage_engagement, instagram_manage_comments,
    // instagram_content_publish.
    const configId = env.NEXT_PUBLIC_FACEBOOK_CONFIG_ID;
    if (configId) {
      url.searchParams.set("config_id", configId);
    }
  }

  redirect(url.toString());
}

// ---------------------------------------------------------------------------
// Save the user-selected account(s) for the channel
// ---------------------------------------------------------------------------

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

  // Submitted from a page already under /{storeSlug}/dashboard/..., so middleware
  // has already injected this — no cookie needed here (unlike connectChannel, which
  // has to survive a round-trip through Facebook's external OAuth dialog).
  const storeSlug = (await headers()).get("x-store-slug") ?? "";

  const cookieStore = await cookies();
  const tempToken = cookieStore.get("meta_temp_user_token")?.value;
  const intent = asChannel(cookieStore.get("meta_channel_intent")?.value);

  if (!tempToken) {
    redirect(`/${storeSlug}/dashboard/integrations/${intent}?error=session_expired`);
  }

  if (intent === "whatsapp") {
    const wabaId = formData.get("wabaId") as string;
    const wabaName = formData.get("wabaName") as string;
    const phoneNumberId = formData.get("phoneNumberId") as string;
    const phoneNumber = formData.get("phoneNumber") as string;

    if (!wabaId || !phoneNumberId) {
      redirect(`/${storeSlug}/dashboard/integrations?error=invalid_selection`);
    }

    try {
      const organizationId = await resolveOrganizationId(session.user.id, storeSlug);
      const longToken = await exchangeForLongLivedToken(tempToken);
      const finalToken = longToken.access_token || tempToken;
      await subscribeWhatsAppWebhooks(wabaId, finalToken);
      await replaceWhatsAppConnection({
        userId: session.user.id,
        organizationId,
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
      cookieStore.delete("meta_channel_store_slug");
    } catch (err) {
      console.error("Failed to save selected Meta connections:", err);
      redirect(`/${storeSlug}/dashboard/integrations?error=save_failed`);
    }

    redirect(`/${storeSlug}/dashboard/integrations?connected=whatsapp`);
  }

  const pageId = formData.get("pageId") as string;
  const pageName = formData.get("pageName") as string;
  const pageAccessToken = formData.get("pageAccessToken") as string;
  const instagramId = formData.get("instagramId") as string;
  const instagramUsername = formData.get("instagramUsername") as string;
  const instagramProfilePictureUrl = formData.get(
    "instagramProfilePictureUrl",
  ) as string;

  const targetPage = intent === "facebook" ? "facebook" : "instagram";

  if (!pageId || !pageAccessToken) {
    redirect(`/${storeSlug}/dashboard/integrations/${targetPage}?error=invalid_selection`);
  }

  try {
    const organizationId = await resolveOrganizationId(session.user.id, storeSlug);
    const longToken = await exchangeForLongLivedToken(pageAccessToken);
    const finalPageToken = longToken.access_token || pageAccessToken;
    await replaceMetaSelection({
      userId: session.user.id,
      organizationId,
      intent,
      pageId,
      pageName,
      pageToken: finalPageToken,
      instagramId,
      instagramUsername,
      instagramProfilePictureUrl,
      storeSlug,
    });

    // Deliberately keep the temp token + intent cookies alive here (instead
    // of clearing them) so the picker stays open — the user can keep
    // clicking "Use this Page" on more Pages without re-authenticating each
    // time. They're cleared when the user explicitly cancels/finishes via
    // cancelMetaSelection, or expire on their own after 10 minutes.
  } catch (err) {
    console.error("Failed to save selected Meta connections:", err);
    redirect(`/${storeSlug}/dashboard/integrations/${targetPage}?error=save_failed`);
  }

  redirect(
    `/${storeSlug}/dashboard/integrations/${intent === "facebook" ? "facebook" : "instagram"}?connected=1`,
  );
}

// ---------------------------------------------------------------------------
// Cancel an in-progress account picker (drops the temp token so the
// connect page falls back to its normal connect + connected-list view)
// ---------------------------------------------------------------------------

export async function cancelMetaSelection(formData: FormData) {
  const channel = asChannel(formData.get("channel"));
  const storeSlug = (await headers()).get("x-store-slug") ?? "";
  const cookieStore = await cookies();

  cookieStore.delete("meta_temp_user_token");
  cookieStore.delete("meta_channel_intent");
  cookieStore.delete("meta_channel_state");
  cookieStore.delete("meta_channel_store_slug");

  redirect(`/${storeSlug}/dashboard/integrations/${channel}`);
}
