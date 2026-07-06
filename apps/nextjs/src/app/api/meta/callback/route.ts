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
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const error = requestUrl.searchParams.get("error");

  if (error || !code) {
    console.error("Meta OAuth error:", error);
    return NextResponse.redirect(
      new URL("/dashboard/integrations?error=meta_denied", req.url),
    );
  }

  // Validate state to prevent CSRF
  const cookieStore = await cookies();
  const savedState = cookieStore.get("meta_channel_state")?.value;

  if (!state || state !== savedState) {
    console.error("Meta OAuth state mismatch");
    return NextResponse.redirect(
      new URL("/dashboard/integrations?error=invalid_state", req.url),
    );
  }

  cookieStore.delete("meta_channel_state");

  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? requestUrl.host;
    const protocol = req.headers.get("x-forwarded-proto") ?? (requestUrl.protocol.startsWith("https") ? "https" : "http");

    const redirectUri =
      env.META_CHANNEL_REDIRECT_URI ??
      `${protocol}://${host}/api/meta/callback`;

    // Step 1: Exchange code for user access token
    const shortToken = await exchangeCodeForToken(code, redirectUri);

    // Step 2: Exchange for long-lived token (~60 days)
    const longToken = await exchangeForLongLivedToken(
      shortToken.access_token,
    );

    const userAccessToken = longToken.access_token;

    // Step 3: Fetch Pages + Instagram business accounts
    const pagesResponse = await getPagesWithInstagram(userAccessToken);

    // Step 4: Upsert each Page and its Instagram account
    for (const page of pagesResponse.data) {
      // Upsert Facebook Page connection
      const existingPage = await db
        .select()
        .from(metaConnection)
        .where(
          and(
            eq(metaConnection.userId, session.user.id),
            eq(metaConnection.platform, "facebook_page"),
            eq(metaConnection.platformAccountId, page.id),
          ),
        )
        .limit(1);

      if (existingPage.length > 0) {
        await db
          .update(metaConnection)
          .set({
            platformAccountName: page.name,
            accessToken: page.access_token,
            metadata: { tasks: page.tasks },
          })
          .where(eq(metaConnection.id, existingPage[0]!.id));
      } else {
        await db.insert(metaConnection).values({
          userId: session.user.id,
          platform: "facebook_page",
          platformAccountId: page.id,
          platformAccountName: page.name,
          accessToken: page.access_token,
          metadata: { tasks: page.tasks },
        });
      }

      // Upsert linked Instagram Business Account (if connected)
      const ig = page.instagram_business_account;
      if (ig) {
        const existingIg = await db
          .select()
          .from(metaConnection)
          .where(
            and(
              eq(metaConnection.userId, session.user.id),
              eq(metaConnection.platform, "instagram"),
              eq(metaConnection.platformAccountId, ig.id),
            ),
          )
          .limit(1);

        if (existingIg.length > 0) {
          await db
            .update(metaConnection)
            .set({
              platformAccountName: ig.username ?? null,
              // Instagram uses the Page's access token for API calls
              accessToken: page.access_token,
              metadata: {
                profile_picture_url: ig.profile_picture_url,
                facebook_page_id: page.id,
              },
            })
            .where(eq(metaConnection.id, existingIg[0]!.id));
        } else {
          await db.insert(metaConnection).values({
            userId: session.user.id,
            platform: "instagram",
            platformAccountId: ig.id,
            platformAccountName: ig.username ?? null,
            accessToken: page.access_token,
            metadata: {
              profile_picture_url: ig.profile_picture_url,
              facebook_page_id: page.id,
            },
          });
        }
      }
    }

    return NextResponse.redirect(
      new URL("/dashboard/integrations?connected=meta", req.url),
    );
  } catch (err) {
    console.error("Meta OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/dashboard/integrations?error=meta_failed", req.url),
    );
  }
}
