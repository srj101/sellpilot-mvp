import { redirect } from "next/navigation";
import { eq } from "@acme/db";

import { db } from "@acme/db/client";
import { metaConnection } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { IntegrationCard } from "./_components/integration-card";

export default async function IntegrationsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Fetch real connections from DB
  const connections = await db
    .select({
      id: metaConnection.id,
      platform: metaConnection.platform,
      platformAccountName: metaConnection.platformAccountName,
    })
    .from(metaConnection)
    .where(eq(metaConnection.userId, session.user.id));


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
      connectionId: fbConnection?.id,
    },
    {
      id: "instagram",
      name: "Instagram",
      description: "Enable auto-reply for Instagram DMs and story replies.",
      connected: !!igConnection,
      account: igConnection
        ? `@${igConnection.platformAccountName}`
        : null,
      connectionId: igConnection?.id,
    },
    {
      id: "whatsapp",
      name: "WhatsApp",
      description: "Enable auto-reply for WhatsApp Business messages.",
      connected: !!waConnection,
      account: waConnection
        ? `Connected: ${waConnection.platformAccountName}`
        : null,
      connectionId: waConnection?.id,
    },
  ];

  return (
    <DashboardShell>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-1 text-base">
          Connect your social accounts to enable auto-replies across your
          channels.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {APPS.map((app) => (
          <IntegrationCard key={app.id} {...app} />
        ))}
      </div>
    </DashboardShell>
  );
}

