import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "./_components/dashboard-shell";
import { DashboardClient } from "./_components/dashboard-client";

export default async function DashboardPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { businessSlug } = await params;

  if (session.user.role === "admin" || session.user.role === "super_admin") {
    redirect(`/${businessSlug}/dashboard/saas`);
  }

  return (
    <DashboardShell>
      <DashboardClient userName={session.user.name} />
    </DashboardShell>
  );
}
