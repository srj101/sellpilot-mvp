import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground text-base">
          Unread signals from the AI agent, channel health, and order alerts.
        </p>
      </div>
    </DashboardShell>
  );
}
