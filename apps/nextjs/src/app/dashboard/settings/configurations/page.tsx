import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../../(home)/_components/dashboard-shell";
import { ConfigurationsClient } from "./configurations-client";

export default async function ConfigurationsSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const caller = await createCaller(await headers());
  const profile = await caller.agent.getBusinessProfile();

  // Serialize profile dates
  const serializedProfile = profile
    ? {
        ...profile,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
      }
    : null;

  return (
    <DashboardShell>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Configurations</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage credentials and site domains for WooCommerce and Shopify integrations.
          </p>
        </div>

        <ConfigurationsClient initialProfile={serializedProfile} />
      </div>
    </DashboardShell>
  );
}
