import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "~/env";
import { metaLoginConfigId, type MetaChannel } from "~/lib/meta-login-config";
import crypto from "crypto";

import { eq } from "@acme/db";
import { db } from "@acme/db/client";
import { business } from "@acme/db/schema";
import { assertChannelAllowed } from "@acme/api/plan-limits";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/dashboard";
  // Despite the param name, this is the business's URL slug, not its DB id — the
  // onboarding "connect channels" step (step-connect-channels.tsx) passes businessSlug
  // through this exact param.
  const businessSlug = url.searchParams.get("businessId");

  // You can specify channel in onboarding, defaulting to facebook
  const channel = url.searchParams.get("channel") ?? "facebook";

  if (!businessSlug) {
    return new Response("Missing businessId", { status: 400 });
  }

  // Gate BEFORE the Facebook OAuth round-trip — this route has no other authorization
  // check today, so without this a business could connect any channel regardless of
  // plan simply by hitting this URL directly (see billing plan channel gating).
  const [biz] = await db.select({ id: business.id }).from(business).where(eq(business.slug, businessSlug)).limit(1);
  if (!biz) {
    return new Response("Business not found", { status: 404 });
  }
  try {
    const catalogChannel = channel === "facebook" ? "messenger" : (channel as "instagram" | "whatsapp");
    await assertChannelAllowed({ db, businessId: biz.id }, catalogChannel);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upgrade your plan to connect this channel.";
    redirect(`/onboarding/create-business?step=connect&slug=${businessSlug}&error=${encodeURIComponent(message)}`);
  }

  const cookieStore = await cookies();
  const state = crypto.randomBytes(24).toString("hex");

  // Keep track of where they should land after the real OAuth flow finishes
  cookieStore.set("oauth_return_to", returnTo, { maxAge: 600, httpOnly: true });

  // Use the same cookies that the real /api/meta/callback expects
  cookieStore.set("meta_channel_store_slug", businessSlug, { maxAge: 600, httpOnly: true, path: "/" });
  cookieStore.set("meta_channel_intent", channel, { maxAge: 600, httpOnly: true, path: "/" });
  cookieStore.set("meta_channel_state", state, { maxAge: 600, httpOnly: true, path: "/" });

  const redirectUri = env.META_CHANNEL_REDIRECT_URI ?? `${url.protocol}//${url.host}/api/meta/callback`;
  const fbVersion = env.FACEBOOK_GRAPH_VERSION;

  const authUrl = new URL(`https://www.facebook.com/${fbVersion}/dialog/oauth`);
  authUrl.searchParams.set("client_id", env.FACEBOOK_APP_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);

  // One Configuration per channel — see metaLoginConfigId for why they cannot be shared.
  const configId = metaLoginConfigId(channel as MetaChannel);
  if (configId) authUrl.searchParams.set("config_id", configId);

  // No `scope` param on purpose. Facebook Login for Business takes its permissions from
  // the Configuration; sending a scope list alongside config_id contradicts it and is
  // rejected as "Invalid Scopes" for anything not already implicitly granted.

  redirect(authUrl.toString());
}
