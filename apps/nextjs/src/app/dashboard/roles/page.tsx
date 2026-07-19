import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { RolesClient } from "./roles-client";
import { Button } from "@acme/ui/button";

export default async function RolesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Roles & Permissions</h1>
            <p className="text-muted-foreground mt-1 text-sm">Define Access Control Levels (ACL) for system operations.</p>
          </div>
          <Button size="sm" className="rounded-lg shadow-sm gap-1">
            <Plus className="h-4 w-4" /> Create Custom Role
          </Button>
        </div>

        <RolesClient />
      </div>
    </DashboardShell>
  );
}
