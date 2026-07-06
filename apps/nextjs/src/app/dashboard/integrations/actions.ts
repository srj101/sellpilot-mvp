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
  getWhatsAppPhoneNumbers,
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
// Connect Facebook Page + Instagram
// ---------------------------------------------------------------------------

/**
 * Server action: Redirects the user to Facebook's OAuth dialog requesting
 * Page and Instagram permissions.
 *
 * After the user grants access, Facebook redirects to /api/meta/callback
 * which handles the token exchange and saves connections.
 */
export async function connectFacebookAndInstagram() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const state = crypto.randomBytes(24).toString("hex");
  const cookieStore = await cookies();

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
  url.searchParams.set(
    "scope",
    ["pages_show_list", "pages_read_engagement"].join(","),
  );

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
    const expectedRedirectUri = env.WHATSAPP_REDIRECT_URI;
    if (expectedRedirectUri && input.redirectUri !== expectedRedirectUri) {
      return { ok: false, error: "Invalid WhatsApp redirect URI" };
    }

    const tokenData = await exchangeCodeForToken(input.code, input.redirectUri);

    if (!tokenData.access_token) {
      return { ok: false, error: "No access token returned" };
    }

    const longToken = await exchangeForLongLivedToken(tokenData.access_token);

    let displayPhoneName = "WhatsApp Business";
    let verifiedName = "";
    let displayPhoneNumber = "";

    if (input.wabaId) {
      try {
        const phoneNumbers = await getWhatsAppPhoneNumbers(
          input.wabaId,
          longToken.access_token,
        );
        if (phoneNumbers.data.length > 0) {
          const mainNumber =
            phoneNumbers.data.find((n) => n.id === input.phoneNumberId) ??
            phoneNumbers.data[0];
          if (mainNumber) {
            verifiedName = mainNumber.verified_name;
            displayPhoneNumber = mainNumber.display_phone_number;
            displayPhoneName = `${mainNumber.verified_name} (${mainNumber.display_phone_number})`;
          }
        }
      } catch (err) {
        console.error("Failed to fetch WhatsApp phone details:", err);
      }
    }

    // Upsert the WhatsApp connection
    if (input.wabaId) {
      const existing = await db
        .select()
        .from(metaConnection)
        .where(
          and(
            eq(metaConnection.userId, session.user.id),
            eq(metaConnection.platform, "whatsapp"),
            eq(metaConnection.platformAccountId, input.wabaId),
          ),
        )
        .limit(1);

      const existingConnection = existing[0];

      if (existingConnection) {
        await db
          .update(metaConnection)
          .set({
            platformAccountName: displayPhoneName,
            accessToken: longToken.access_token,
            accessTokenExpiresAt: longToken.expires_in
              ? new Date(Date.now() + longToken.expires_in * 1000)
              : null,
            metadata: {
              phone_number_id: input.phoneNumberId,
              verified_name: verifiedName,
              display_phone_number: displayPhoneNumber,
            },
          })
          .where(eq(metaConnection.id, existingConnection.id));
      } else {
        await db.insert(metaConnection).values({
          userId: session.user.id,
          platform: "whatsapp",
          platformAccountId: input.wabaId,
          platformAccountName: displayPhoneName,
          accessToken: longToken.access_token,
          accessTokenExpiresAt: longToken.expires_in
            ? new Date(Date.now() + longToken.expires_in * 1000)
            : null,
          metadata: {
            phone_number_id: input.phoneNumberId,
            verified_name: verifiedName,
            display_phone_number: displayPhoneNumber,
          },
        });
      }
    }

    return { ok: true };
  } catch (err) {
    console.error("WhatsApp signup error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Server action: Saves the selected Facebook Page and connected Instagram account
 * to the meta_connection table and removes the temporary user token cookie.
 */
export async function saveSelectedPage(formData: FormData) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const tempToken = cookieStore.get("meta_temp_user_token")?.value;

  if (!tempToken) {
    redirect("/dashboard/integrations?error=session_expired");
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
    // Exchange short-lived page token for long-lived page token
    const longToken = await exchangeForLongLivedToken(pageAccessToken);
    const finalPageToken = longToken.access_token || pageAccessToken;

    // Delete any existing facebook_page or instagram connections for this user
    await db
      .delete(metaConnection)
      .where(
        and(
          eq(metaConnection.userId, session.user.id),
          inArray(metaConnection.platform, ["facebook_page", "instagram"]),
        ),
      );

    // Save Facebook Page connection
    await db.insert(metaConnection).values({
      userId: session.user.id,
      platform: "facebook_page",
      platformAccountId: pageId,
      platformAccountName: pageName,
      accessToken: finalPageToken,
    });

    // Save Instagram Business connection if present
    if (instagramId) {
      await db.insert(metaConnection).values({
        userId: session.user.id,
        platform: "instagram",
        platformAccountId: instagramId,
        platformAccountName: instagramUsername,
        accessToken: finalPageToken,
        metadata: {
          profile_picture_url: instagramProfilePictureUrl || null,
          facebook_page_id: pageId,
        },
      });
    }

    // Clean up cookie
    cookieStore.delete("meta_temp_user_token");
  } catch (err) {
    console.error("Failed to save selected Meta connections:", err);
    redirect("/dashboard/integrations?error=save_failed");
  }

  redirect("/dashboard/integrations?connected=meta");
}
