import { redirect } from "next/navigation";

import { desc, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { offer } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { OffersClient } from "./offers-client";

export default async function OffersPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const offers = await db
    .select()
    .from(offer)
    .where(eq(offer.userId, session.user.id))
    .orderBy(desc(offer.createdAt));

  return (
    <DashboardShell>
      <OffersClient initialOffers={offers} />
    </DashboardShell>
  );
}
