import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);

  // This callback is used as the OAuth redirect target for WhatsApp Embedded Signup.
  // The actual code exchange happens in the client/server flow, so we simply
  // send the user back to the integrations page after Meta finishes the hop.
  // Not under /{storeSlug}/dashboard/*, so it relies on the same
  // meta_channel_store_slug cookie stashed by connectChannel (see
  // /api/meta/callback/route.ts for the full explanation).
  const storeSlug = (await cookies()).get("meta_channel_store_slug")?.value;
  const destination = new URL(
    storeSlug ? `/${storeSlug}/dashboard/integrations` : "/dashboard",
    url.origin,
  );
  if (url.searchParams.get("connected") === "meta") {
    destination.searchParams.set("connected", "meta");
  }

  return NextResponse.redirect(destination);
}
