import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { headers } from "next/headers";
import { SuperadminClient } from "./_components/superadmin-client";

export default async function SuperadminPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const userRole = (session.user as { role?: string | null }).role;
  if (userRole !== "superadmin") redirect("/");

  const caller = await createCaller(await headers());
  const users = await caller.superadmin.listUsers();

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
              <span className="text-sm">🛡️</span>
            </div>
            <div>
              <h1 className="text-lg font-bold">SellPilot Admin</h1>
              <p className="text-xs text-muted-foreground">Platform superadmin panel</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <SuperadminClient initialUsers={users} />
      </div>
    </div>
  );
}
