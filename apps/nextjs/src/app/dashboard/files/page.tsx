import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";

export default async function FilesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Files</h1>
        <p className="text-muted-foreground text-base">
          Upload, organize, and search images and documents. Videos are not
          supported in this release.
        </p>
      </div>
    </DashboardShell>
  );
}
