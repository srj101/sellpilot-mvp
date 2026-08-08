import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { ProfileClient } from "./profile-client";

export default async function ProfileSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage your personal info, contact details, and password.</p>
        </div>

        <ProfileClient
          initialName={session.user.name ?? ""}
          initialEmail={session.user.email ?? ""}
          initialImage={session.user.image ?? null}
        />
      </div>
  );
}
