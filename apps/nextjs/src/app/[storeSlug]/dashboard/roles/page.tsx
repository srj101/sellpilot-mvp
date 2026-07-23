import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { RolesClient } from "./roles-client";

export default async function RolesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Roles & Permissions</h1>
          <p className="text-muted-foreground mt-1 text-sm">Define Access Control Levels (ACL) for system operations, and manage your team.</p>
        </div>

        <RolesClient />
      </div>
    </DashboardShell>
  );
}
