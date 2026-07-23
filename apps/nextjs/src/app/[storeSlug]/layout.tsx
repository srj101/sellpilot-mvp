import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";

/**
 * Every route under /{storeSlug}/* requires the caller to actually be a member of that
 * store — the URL is never trusted on its own. This also keeps session.activeOrganizationId
 * (what orgProcedure resolves data against) in sync with the URL, so navigating here for
 * the first time in a session switches your active store, not just the address bar.
 */
export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { storeSlug } = await params;
  const caller = await createCaller(await headers());
  const result = await caller.org.enterBySlug({ slug: storeSlug });

  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    redirect("/onboarding/select-store");
  }

  return <>{children}</>;
}
