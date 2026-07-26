import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { BillingClient } from "./billing-client";

export default async function BillingPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { businessSlug } = await params;

  // Billing is owner-only (User Flows §4.3) — hiding the sidebar link isn't access
  // control, so this page enforces it too, not just the underlying mutations.
  const caller = await createCaller(await headers());
  const { role } = await caller.roles.getMyPermissions();

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing & Subscriptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your billing plan, invoices, and payment methods.</p>
        </div>

        {role !== "owner" ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border py-16 text-center">
            <ShieldAlert className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Only the business owner can view billing.</p>
            <p className="text-xs text-muted-foreground">Ask the business owner if you need something changed here.</p>
          </div>
        ) : (
          <BillingClient businessSlug={businessSlug} />
        )}
      </div>
    </DashboardShell>
  );
}
