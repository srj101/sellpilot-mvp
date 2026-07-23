import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";

/**
 * The bare, unscoped /dashboard is only ever a landing redirector — every login/signup
 * flow's callbackURL points here unchanged. Real dashboard routes live under
 * /{storeSlug}/dashboard/*; this resolves which store that should be.
 */
export default async function DashboardRedirectPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const caller = await createCaller(await headers());
  const myStores = await caller.org.listMine();

  if (myStores.length === 0) {
    redirect("/onboarding/create-store");
  }

  if (myStores.length === 1) {
    redirect(`/${myStores[0]!.slug}/dashboard`);
  }

  const active = myStores.find((s) => s.isActive);
  redirect(active ? `/${active.slug}/dashboard` : "/onboarding/select-store");
}
