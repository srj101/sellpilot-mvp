import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";

export default async function InvoicesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
        <p className="text-muted-foreground text-base">
          All, paid, pending, and overdue invoices. Print, share, and download
          from one place.
        </p>
      </div>
    </DashboardShell>
  );
}
