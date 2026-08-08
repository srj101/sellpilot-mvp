import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { InvoicesClient } from "./invoices-client";

export default async function InvoicesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All paid, pending, and overdue billing invoices. Print, share, and download receipts in BDT.
          </p>
        </div>

        <InvoicesClient />
      </div>
  );
}
