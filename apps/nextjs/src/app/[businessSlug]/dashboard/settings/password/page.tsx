import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../../(home)/_components/dashboard-shell";
import { PasswordClient } from "./password-client";

export default async function PasswordSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security & Password</h1>
          <p className="text-muted-foreground mt-1 text-sm">Update your password credentials and account security settings.</p>
        </div>

        <PasswordClient />
      </div>
    </DashboardShell>
  );
}
