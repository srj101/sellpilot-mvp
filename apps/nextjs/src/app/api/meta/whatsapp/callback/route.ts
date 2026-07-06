import { NextResponse } from "next/server";

export function GET(request: Request) {
  const url = new URL(request.url);

  // This callback is used as the OAuth redirect target for WhatsApp Embedded Signup.
  // The actual code exchange happens in the client/server flow, so we simply
  // send the user back to the integrations page after Meta finishes the hop.
  const destination = new URL("/dashboard/integrations", url.origin);
  if (url.searchParams.get("connected") === "meta") {
    destination.searchParams.set("connected", "meta");
  }

  return NextResponse.redirect(destination);
}
