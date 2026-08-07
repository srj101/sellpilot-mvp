import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "./_components/dashboard-shell";
import { DashboardClient } from "./_components/dashboard-client";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // The real superadmin panel lives at /superadmin; the /{slug}/dashboard/saas page is a
  // static Haze mock, not a functional route — never redirect there. Platform "admin" users
  // land on their normal dashboard and reach Users via the sidebar.
  if (session.user.role === "superadmin") {
    redirect("/superadmin");
  }

  return (
    <DashboardShell>
      <DashboardClient userName={session.user.name} />
    </DashboardShell>
  );
}
