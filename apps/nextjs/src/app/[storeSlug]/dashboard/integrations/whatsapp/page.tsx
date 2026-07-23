import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@acme/ui/button";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../../(home)/_components/dashboard-shell";
import { WhatsAppConnectPanel } from "../_components/whatsapp-connect-panel";
import { WhatsAppIcon } from "../_components/integration-icons";

export default async function WhatsAppIntegrationPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { storeSlug } = await params;
  const caller = await createCaller(await headers());
  const connections = await caller.integrations.list();
  const pages = connections
    .filter((c) => c.platform === "whatsapp")
    .map((c) => ({
      id: c.id,
      name: c.platformAccountName ?? "WhatsApp Number",
      externalId: c.platformAccountId,
      webhookStatus: c.webhookSubscriptionStatus,
      connectedAt: c.connectedAt,
    }));

  return (
    <DashboardShell>
      <div className="mx-auto max-w-lg">
        <Button variant="ghost" size="sm" className="mb-6" asChild>
          <a href={`/${storeSlug}/dashboard/integrations`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Integrations
          </a>
        </Button>

        <div className="bg-card rounded-2xl border p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#25D366]/10 text-[#25D366]">
              <WhatsAppIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">WhatsApp</h1>
              <p className="text-muted-foreground text-sm">
                Auto-reply to WhatsApp Business messages.
              </p>
            </div>
          </div>

          <WhatsAppConnectPanel pages={pages} />
        </div>
      </div>
    </DashboardShell>
  );
}
