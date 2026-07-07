import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq, and } from "@acme/db";

import { db } from "@acme/db/client";
import { metaConnection } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { env } from "~/env";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getPagesWithInstagram,
} from "~/lib/meta";

/**
 * GET /api/meta/callback
 *
 * OAuth callback for Facebook Page + Instagram channel connections.
 * This is NOT the better-auth login callback — that lives at /api/auth/callback/facebook.
 *
 * Flow:
 * 1. User clicks "Connect Facebook Page + Instagram" on the integrations page
 * 2. Server action redirects to Facebook OAuth dialog with pages_show_list etc. scopes
 * 3. Facebook redirects here with ?code=...&state=...
 * 4. We exchange code → short-lived token → long-lived token
 * 5. We fetch /me/accounts to get Pages + linked Instagram Business Accounts
 * 6. We upsert rows in meta_connection table
 * 7. We redirect back to /dashboard/integrations
 */
export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? requestUrl.host;
  const protocol = req.headers.get("x-forwarded-proto") ?? (requestUrl.protocol.startsWith("https") ? "https" : "http");

  const session = await getSession();

  if (!session?.user) {
    return NextResponse.redirect(`${protocol}://${host}/login`);
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error");

  if (error || !code) {
    console.error("Meta OAuth error:", error);
    return NextResponse.redirect(
      `${protocol}://${host}/dashboard/integrations?error=meta_denied`,
    );
  }

  // Validate state to prevent CSRF
  const cookieStore = await cookies();
  const savedState = cookieStore.get("meta_channel_state")?.value;

  if (!state || state !== savedState) {
    console.error("Meta OAuth state mismatch");
    return NextResponse.redirect(
      `${protocol}://${host}/dashboard/integrations?error=invalid_state`,
    );
  }

  cookieStore.delete("meta_channel_state");

  try {
    const redirectUri =
      env.META_CHANNEL_REDIRECT_URI ??
      `${protocol}://${host}/api/meta/callback`;

    // Step 1: Exchange code for user access token
    const shortToken = await exchangeCodeForToken(code, redirectUri);

    // Step 2: Exchange for long-lived token (~60 days)
    const longToken = await exchangeForLongLivedToken(
      shortToken.access_token,
    );

    // Step 3: Save user access token temporarily in cookie
    cookieStore.set("meta_temp_user_token", longToken.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60, // 10 minutes
      path: "/",
    });

    // Forward the user's channel intent so the select page can render the
    // right list. Default to "facebook" for backwards compatibility.
    const intent = cookieStore.get("meta_channel_intent")?.value;
    const channelParam =
      intent === "instagram" ? "instagram" : "facebook";

    return NextResponse.redirect(
      `${protocol}://${host}/dashboard/integrations/select?channel=${channelParam}`,
    );
  } catch (err) {
    console.error("Meta OAuth callback error:", err);
    return NextResponse.redirect(
      `${protocol}://${host}/dashboard/integrations?error=meta_failed`,
    );
  }
}
