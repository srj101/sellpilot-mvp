import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";

/**
 * Every route under /{businessSlug}/* requires the caller to actually be a member of that
 * store — the URL is never trusted on its own. This also keeps session.activeBusinessId
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
  params: Promise<{ businessSlug: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.emailVerified) redirect("/verify-email");

  const { businessSlug } = await params;

  // Superadmin bypasses membership check — can enter any store
  const userRole = (session.user as { role?: string | null }).role;
  if (userRole === "superadmin") {
    return <>{children}</>;
  }

  const caller = await createCaller(await headers());
  const result = await caller.business.enterBySlug({ slug: businessSlug });

  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    redirect("/onboarding/select-business");
  }

  // Business exists but the wizard was abandoned partway (e.g. closed the browser right after
  // step 1) — resume it instead of dropping them into a dashboard they never finished setting up.
  // No loop-guard needed here: /onboarding/create-business is outside this layout's scope.
  if (!result.onboardingCompleted) {
    redirect(`/onboarding/create-business?step=connect&slug=${businessSlug}`);
  }

  // The locked page itself lives under /{businessSlug}/dashboard/locked, which this layout
  // also governs — skip the redirect there or every visit to it would loop right back.
  if (result.locked) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (!pathname.endsWith("/dashboard/locked")) {
      redirect(`/${businessSlug}/dashboard/locked`);
    }
  }

  return <>{children}</>;
}
