import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { SupportClient } from "./support-client";
import { Button } from "@acme/ui/button";

export default async function SupportPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { businessSlug } = await params;

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Support Tickets</h1>
            <p className="text-muted-foreground mt-1 text-sm">Help and customer service center.</p>
          </div>
          {/* No standalone "create ticket" flow — tickets are conversations flagged from the
              Inbox (see thread-header-actions.tsx's "Mark as Ticket"), so this links there
              instead of a form that has nothing real to submit to. */}
          <Link href={`/${businessSlug}/dashboard/inbox`}>
            <Button size="sm" variant="outline" className="rounded-lg shadow-sm gap-1.5">
              <Inbox className="h-4 w-4" /> Go to Inbox
            </Button>
          </Link>
        </div>

        <SupportClient />
      </div>
    </DashboardShell>
  );
}
