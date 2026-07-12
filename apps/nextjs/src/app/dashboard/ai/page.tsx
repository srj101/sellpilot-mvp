import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";

export default async function AIPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">AI Agent</h1>
        <p className="text-muted-foreground text-base">
          Behavior, training data, and live conversation control for your
          multilingual sales agent.
        </p>
      </div>
    </DashboardShell>
  );
}
