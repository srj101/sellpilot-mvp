import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { IntegrationCard } from "./_components/integration-card";

export default async function IntegrationsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const caller = await createCaller(await headers());
  const connections = await caller.integrations.list();

  const fbConnection = connections.find(
    (c) => c.platform === "facebook_page",
  );
  const igConnection = connections.find((c) => c.platform === "instagram");
  const waConnection = connections.find((c) => c.platform === "whatsapp");

  const APPS = [
    {
      id: "facebook",
      name: "Facebook",
      description: "Enable auto-reply for Facebook messages and comments.",
      connected: !!fbConnection,
      account: fbConnection
        ? `Connected as ${fbConnection.platformAccountName}`
        : null,
    },
    {
      id: "instagram",
      name: "Instagram",
      description: "Enable auto-reply for Instagram DMs and story replies.",
      connected: !!igConnection,
      account: igConnection ? `@${igConnection.platformAccountName}` : null,
    },
    {
      id: "whatsapp",
      name: "WhatsApp",
      description: "Enable auto-reply for WhatsApp Business messages.",
      connected: !!waConnection,
      account: waConnection
        ? `Connected: ${waConnection.platformAccountName}`
        : null,
    },
  ];

  return (
    <DashboardShell>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-1 text-base">
          Tap a channel to connect it and manage auto-replies.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
        {APPS.map((app) => (
          <IntegrationCard key={app.id} {...app} />
        ))}
      </div>
    </DashboardShell>
  );
}

