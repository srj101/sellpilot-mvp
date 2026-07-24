import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";

/**
 * Every route under /{storeSlug}/* requires the caller to actually be a member of that
 * store — the URL is never trusted on its own. This also keeps session.activeOrganizationId
 * (what orgProcedure resolves data against) in sync with the URL, so navigating here for
 * the first time in a session switches your active store, not just the address bar.
 *
 * Superadmins (user.role = "superadmin") bypass the membership check and can enter any
 * store directly — they are the SellPilot platform owner / developer.
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

  // Superadmin bypasses membership check — can enter any store
  const userRole = (session.user as { role?: string | null }).role;
  if (userRole === "superadmin") {
    return <>{children}</>;
  }

  const caller = await createCaller(await headers());
  const result = await caller.org.enterBySlug({ slug: storeSlug });

  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    redirect("/onboarding/select-store");
  }

  return <>{children}</>;
}
