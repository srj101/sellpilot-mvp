import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";

export default async function InboxPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
      <p className="text-muted-foreground mt-1 text-base">
        View and manage your messages.
      </p>
    </DashboardShell>
  );
}
