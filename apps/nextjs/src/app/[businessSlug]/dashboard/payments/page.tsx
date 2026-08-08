import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { PaymentsClient } from "./_components/payments-client";

export default async function PaymentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Reuses the existing orders:view permission — the resource list in
  // SELLPILOT_USER_FLOWS.md §3.3 has no dedicated "payments" entry (billing plan Q5).
  const caller = await createCaller(await headers());
  const { role, permissions } = await caller.roles.getMyPermissions();
  const canView = role === "owner" || permissions.includes("*") || permissions.includes("orders:view");

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track how your customers pay you — reconcile transactions, refunds, and cash on delivery.</p>
        </div>

        {canView ? (
          <PaymentsClient />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border py-16 text-center">
            <ShieldAlert className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">You don&apos;t have access to Payments.</p>
          </div>
        )}
      </div>
  );
}
