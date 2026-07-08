import { redirect } from "next/navigation";

import { eq } from "@acme/db";
import { db } from "@acme/db/client";
import {
  businessProfile,
  shippingRate,
  faq,
  policy,
} from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const userId = session.user.id;

  const [profiles, rates, faqs, policies] = await Promise.all([
    db.select().from(businessProfile).where(eq(businessProfile.userId, userId)),
    db.select().from(shippingRate).where(eq(shippingRate.userId, userId)),
    db.select().from(faq).where(eq(faq.userId, userId)),
    db.select().from(policy).where(eq(policy.userId, userId)),
  ]);

  const profile = profiles[0] ?? null;

  return (
    <DashboardShell>
      <SettingsClient
        profile={profile}
        shippingRates={rates}
        faqs={faqs}
        policies={policies}
      />
    </DashboardShell>
  );
}
