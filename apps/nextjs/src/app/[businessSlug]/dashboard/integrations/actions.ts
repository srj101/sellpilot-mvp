"use server";

import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { and, eq, inArray, ne } from "@acme/db";
import { db } from "@acme/db/client";
import { business, businessMember, metaConnection } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { env } from "~/env";
import {
  exchangeForLongLivedToken,
  subscribeInstagramWebhooks,
  subscribeMetaPageWebhooks,
  subscribeWhatsAppWebhooks,
} from "@acme/api/meta";
import { assertChannelAllowed } from "@acme/api/plan-limits";

const FB_VERSION = env.FACEBOOK_GRAPH_VERSION;

// These are plain Server Actions (see comment below), not tRPC procedures, so they don't
// get orgProcedure's automatic businessId resolution — this mirrors that same lookup
// (URL slug -> real businessMembership row), never trusting the slug alone.
async function resolveBusinessId(userId: string, businessSlug: string): Promise<string> {
  console.log("resolveBusinessId called with:", { userId, businessSlug });
  const [org] = await db
    .select({ id: business.id })
    .from(business)
    .where(eq(business.slug, businessSlug))
    .limit(1);
  console.log("org found:", org);
  if (!org) throw new Error(`Store not found for slug: ${businessSlug}`);

  const [businessMembership] = await db
    .select({ id: businessMember.id })
    .from(businessMember)
    .where(and(eq(businessMember.businessId, org.id), eq(businessMember.userId, userId)))
    .limit(1);
  if (!businessMembership) throw new Error("You don't have access to this business.");

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
  businessId: string;
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
        eq(metaConnection.businessId, input.businessId),
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
    businessId: input.businessId,
    platform: "whatsapp",
    platformAccountId: input.phoneNumberId ?? input.wabaId,
    ...values,
  });
}

async function replaceMetaSelection(input: {
  userId: string;
  businessId: string;
  intent: "facebook" | "instagram";
  pageId: string;
  pageName: string;
  pageToken: string;
  instagramId?: string;
  instagramUsername?: string;
  instagramProfilePictureUrl?: string;
  businessSlug: string;
  /** When true, first detaches this exact Page/account from whatever OTHER business
   * currently has it before connecting it here — see saveSelectedPage's pre-flight
   * conflict check, which is what actually decides whether this is allowed to be true. */
  forceReconnect?: boolean;
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
      businessId: input.businessId,
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
    await db.transaction(async (tx) => {
      if (input.forceReconnect) {
        await tx
          .delete(metaConnection)
          .where(
            and(
              eq(metaConnection.platform, "facebook_page"),
              eq(metaConnection.platformAccountId, input.pageId),
              ne(metaConnection.businessId, input.businessId),
            ),
          );
      }
      await tx
        .insert(metaConnection)
        .values(values)
        .onConflictDoUpdate({
          target: [
            metaConnection.businessId,
            metaConnection.platform,
            metaConnection.platformAccountId,
          ],
          set: { ...values, updatedAt: new Date() },
        });
    });
    return;
  }

  if (!input.instagramId) {
    redirect(`/${input.businessSlug}/dashboard/integrations/instagram?error=no_instagram_account`);
  }
  // Narrowing on `input.instagramId` doesn't survive into the closure below (TS only
  // narrows local variables across closures, not object property access), so alias it
  // to a local const here — it's guaranteed defined past the guard above.
  const instagramId = input.instagramId;

  const values = {
    userId: input.userId,
    businessId: input.businessId,
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
  await db.transaction(async (tx) => {
    if (input.forceReconnect) {
      await tx
        .delete(metaConnection)
        .where(
          and(
            eq(metaConnection.platform, "instagram"),
            eq(metaConnection.platformAccountId, instagramId),
            ne(metaConnection.businessId, input.businessId),
          ),
        );
    }
    await tx
      .insert(metaConnection)
      .values(values)
      .onConflictDoUpdate({
        target: [
          metaConnection.businessId,
          metaConnection.platform,
          metaConnection.platformAccountId,
        ],
        set: { ...values, updatedAt: new Date() },
      });
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
  // route (/api/meta/callback, not under [businessSlug]) before landing back on a
  // store-scoped page — the business slug has to survive that trip the same way the
  // channel intent already does: as a short-lived cookie, not a URL param Facebook
  // would just drop.
  const businessSlug = (await headers()).get("x-business-slug");
  if (businessSlug) {
    cookieStore.set("meta_channel_store_slug", businessSlug, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      maxAge: 10 * 60,
      path: "/",
    });

    // Gate BEFORE the Facebook OAuth round-trip, not just at save time — rejecting only
    // after the user already went through the login dialog is a far worse experience
    // than never starting it. Skipped only when there's no resolvable slug at all — this
    // path isn't actually reachable from onboarding (it posts to the separate
    // /api/integrations/facebook/connect route instead, gated there), this is just a
    // defensive fallback for the rare case of a missing header.
    try {
      const businessId = await resolveBusinessId(session.user.id, businessSlug);
      const catalogChannel = channel === "facebook" ? "messenger" : channel;
      await assertChannelAllowed({ db, businessId }, catalogChannel);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upgrade your plan to connect this channel.";
      redirect(`/${businessSlug}/dashboard/integrations?error=${encodeURIComponent(message)}`);
    }
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
export async function saveSelectedPage(formData: FormData) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  // This form can also be submitted from /onboarding/create-business, which isn't under
  // /{businessSlug}/dashboard/* — middleware never sets x-business-slug there, so fall back
  // to the cookie stashed by connectChannel / the onboarding connect route (see
  // /api/meta/callback, which has this same fallback for the same reason).
  const businessSlug =
    (await headers()).get("x-business-slug") ??
    cookieStore.get("meta_channel_store_slug")?.value ??
    "";
  const intent = asChannel(cookieStore.get("meta_channel_intent")?.value) as
    | "facebook"
    | "instagram";

  const returnTo = formData.get("returnTo") as string | null;
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
    redirect(returnTo ? `${returnTo}&error=invalid_selection` : `/${businessSlug}/dashboard/integrations/${targetPage}?error=invalid_selection`);
  }

  // Resolved and gated outside the main try/catch below on purpose: redirect() throws a
  // special Next.js control-flow error, and if it were thrown inside that try, the outer
  // catch would swallow it and redirect a second time to a generic "save_failed" — losing
  // the specific upgrade message. Keeping this as its own step (same shape as
  // connectChannel's earlier soft gate) lets its redirect() propagate untouched.
  const gateBusinessId = await resolveBusinessId(session.user.id, businessSlug);
  // Re-checked right before the actual persist, not just at connectChannel's earlier soft
  // gate — that cookie-driven gate is up to 10 minutes stale (a plan downgrade mid-flow,
  // or a form POST that skips the earlier redirect entirely, must not slip an Instagram
  // connection through). Messenger ("facebook" intent) has no gate — included on every plan.
  if (intent === "instagram") {
    try {
      await assertChannelAllowed({ db, businessId: gateBusinessId }, "instagram");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upgrade your plan to connect Instagram.";
      redirect(returnTo ? `${returnTo}&error=${encodeURIComponent(message)}` : `/${businessSlug}/dashboard/integrations/instagram?error=${encodeURIComponent(message)}`);
    }
  }

  // A single Page/Instagram account can only ever deliver webhooks to one business — see
  // resolveMetaConnection in the meta webhook route, which has no way to pick "the right
  // one" if two businesses both claim the same external account. The picker is supposed
  // to steer this via forceReconnect (see meta-account-picker.tsx's "Unlink & reconnect"
  // button), but this is the real enforcement point: it re-checks regardless of what the
  // client sent, so a stale picker render or a direct form POST can't silently create a
  // second, competing connection to the same Page.
  const forceReconnect = formData.get("forceReconnect") === "1";
  const targetAccountId = intent === "facebook" ? pageId : instagramId;
  if (!forceReconnect && targetAccountId) {
    const [conflict] = await db
      .select({ id: metaConnection.id })
      .from(metaConnection)
      .where(
        and(
          eq(metaConnection.platform, intent === "facebook" ? "facebook_page" : "instagram"),
          eq(metaConnection.platformAccountId, targetAccountId),
          ne(metaConnection.businessId, gateBusinessId),
        ),
      )
      .limit(1);
    if (conflict) {
      const message = "This page is already connected to another one of your stores. Use “Unlink & reconnect” to move it here.";
      redirect(returnTo ? `${returnTo}&error=${encodeURIComponent(message)}` : `/${businessSlug}/dashboard/integrations/${targetPage}?error=${encodeURIComponent(message)}`);
    }
  }

  try {
    const businessId = await resolveBusinessId(session.user.id, businessSlug);
    const longToken = await exchangeForLongLivedToken(pageAccessToken);
    const finalPageToken = longToken.access_token || pageAccessToken;
    await replaceMetaSelection({
      userId: session.user.id,
      businessId,
      intent,
      pageId,
      pageName,
      pageToken: finalPageToken,
      instagramId,
      instagramUsername,
      instagramProfilePictureUrl,
      businessSlug,
      forceReconnect,
    });

    // Deliberately keep the temp token + intent cookies alive here (instead
    // of clearing them) so the picker stays open — the user can keep
    // clicking "Use this Page" on more Pages without re-authenticating each
    // time. They're cleared when the user explicitly cancels/finishes via
    // cancelMetaSelection, or expire on their own after 10 minutes.
  } catch (err) {
    console.error("Failed to save selected Meta connections:", err);
    redirect(returnTo ? `${returnTo}&error=save_failed` : `/${businessSlug}/dashboard/integrations/${targetPage}?error=save_failed`);
  }

  redirect(
    returnTo ? `${returnTo}&connected=1` : `/${businessSlug}/dashboard/integrations/${intent === "facebook" ? "facebook" : "instagram"}?connected=1`,
  );
}

// ------------------------------------------------------------------------------------------

export async function cancelMetaSelection(formData: FormData) {
  const channel = asChannel(formData.get("channel"));
  const cookieStore = await cookies();
  const businessSlug =
    (await headers()).get("x-business-slug") ??
    cookieStore.get("meta_channel_store_slug")?.value ??
    "";

  cookieStore.delete("meta_temp_user_token");
  cookieStore.delete("meta_channel_intent");
  cookieStore.delete("meta_channel_state");
  cookieStore.delete("meta_channel_store_slug");

  const returnTo = formData.get("returnTo") as string | null;
  if (returnTo) {
    redirect(returnTo);
  }

  redirect(`/${businessSlug}/dashboard/integrations/${channel === "whatsapp" ? "" : channel}`);
}

export async function fetchAvailableMetaPages() {
  const cookieStore = await cookies();
  const tempToken = cookieStore.get("meta_temp_user_token")?.value;
  const intent = cookieStore.get("meta_channel_intent")?.value;

  if (!tempToken) return { pages: [], isPicking: false, intent: null };

  try {
    const { getPagesWithInstagram } = await import("@acme/api/meta");
    const response = await getPagesWithInstagram(tempToken, "facebook");
    return { pages: response.data || [], isPicking: true, intent };
  } catch (err) {
    console.error("Failed to load Facebook Pages:", err);
    return { pages: [], isPicking: true, intent, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
