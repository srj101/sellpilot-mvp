import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardClient } from "./_components/dashboard-client";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return <DashboardClient userName={session.user.name} />;
}
