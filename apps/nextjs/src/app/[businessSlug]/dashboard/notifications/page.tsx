import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { NotificationsClient } from "./notifications-client";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const caller = await createCaller(await headers());
  const initialNotifications = await caller.notifications.list({ limit: 50 });

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground text-base">
            Unread signals from the AI agent, channel health, and order alerts.
          </p>
        </div>

        <NotificationsClient initialNotifications={initialNotifications} />
      </div>
    </DashboardShell>
  );
}
