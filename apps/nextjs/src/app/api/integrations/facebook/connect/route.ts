import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "~/env";
import crypto from "crypto";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/dashboard";
  const businessId = url.searchParams.get("businessId");
  
  // You can specify channel in onboarding, defaulting to facebook
  const channel = url.searchParams.get("channel") ?? "facebook";

  if (!businessId) {
    return new Response("Missing businessId", { status: 400 });
  }

  const cookieStore = await cookies();
  const state = crypto.randomBytes(24).toString("hex");

  // Keep track of where they should land after the real OAuth flow finishes
  cookieStore.set("oauth_return_to", returnTo, { maxAge: 600, httpOnly: true });

  // Use the same cookies that the real /api/meta/callback expects
  cookieStore.set("meta_channel_store_slug", businessId, { maxAge: 600, httpOnly: true, path: "/" });
  cookieStore.set("meta_channel_intent", channel, { maxAge: 600, httpOnly: true, path: "/" });
  cookieStore.set("meta_channel_state", state, { maxAge: 600, httpOnly: true, path: "/" });

  const redirectUri = env.META_CHANNEL_REDIRECT_URI ?? `${url.protocol}//${url.host}/api/meta/callback`;
  const fbVersion = process.env.FACEBOOK_GRAPH_VERSION ?? "v25.0";

  const authUrl = new URL(`https://www.facebook.com/${fbVersion}/dialog/oauth`);
  authUrl.searchParams.set("client_id", env.FACEBOOK_APP_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);

  if (channel === "whatsapp") {
    const configId = env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID;
    if (configId) authUrl.searchParams.set("config_id", configId);
  } else {
    const configId = env.NEXT_PUBLIC_FACEBOOK_CONFIG_ID;
    if (configId) authUrl.searchParams.set("config_id", configId);
  }

  const scopes = [
    "pages_show_list",
    "pages_messaging",
    "pages_manage_metadata",
    "instagram_basic",
    "instagram_manage_messages",
  ];
  authUrl.searchParams.set("scope", scopes.join(","));

  redirect(authUrl.toString());
}
