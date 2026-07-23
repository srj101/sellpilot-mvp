import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "./_components/dashboard-shell";
import { DashboardClient } from "./_components/dashboard-client";

function currentTimestamp() {
  return Date.now();
}

export default async function DashboardPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { storeSlug } = await params;

  if (session.user.role === "admin" || session.user.role === "super_admin") {
    redirect(`/${storeSlug}/dashboard/saas`);
  }

  const caller = await createCaller(await headers());
  const data = await caller.dashboard.getOverview();

  return (
    <DashboardShell>
      <DashboardClient
        userName={session.user.name}
        now={currentTimestamp()}
        orders={data.orders.map((o) => ({
          ...o,
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.updatedAt.toISOString(),
        }))}
        productCount={data.productCount}
        customerCount={data.customerCount}
        activeOfferCount={data.activeOfferCount}
        recentItems={data.recentItems.map((i) => ({
          ...i,
          createdAt: i.createdAt.toISOString(),
        }))}
        messageStats={data.messageStats}
      />
    </DashboardShell>
  );
}
