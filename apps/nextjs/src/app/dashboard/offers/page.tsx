import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { OffersClient } from "./offers-client";

export default async function OffersPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const caller = await createCaller(await headers());
  const offers = await caller.offers.list();

  return (
    <DashboardShell>
      <OffersClient initialOffers={offers} />
    </DashboardShell>
  );
}
