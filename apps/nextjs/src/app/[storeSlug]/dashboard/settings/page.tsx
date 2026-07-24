import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const caller = await createCaller(await headers());
  const [storeProfile, profile, shippingRates, policies, faqs] = await Promise.all([
    caller.org.current(),
    caller.agent.getBusinessProfile(),
    caller.agent.listShippingRates(),
    caller.settings.listAllPolicies(),
    caller.agent.listFaqs({}),
  ]);

  return (
    <DashboardShell>
      <SettingsClient
        storeProfile={storeProfile}
        profile={profile ?? null}
        shippingRates={shippingRates}
        faqs={faqs}
        policies={policies}
      />
    </DashboardShell>
  );
}
