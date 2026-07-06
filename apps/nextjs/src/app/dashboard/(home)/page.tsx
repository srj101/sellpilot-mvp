import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "./_components/dashboard-shell";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <h1 className="text-3xl font-bold tracking-tight">
        Welcome, {session.user.name ?? "User"}
      </h1>
      <p className="text-muted-foreground mt-1 text-base">
        You are signed in as {session.user.email}.
      </p>
    </DashboardShell>
  );
}
