import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { IntegrationCard } from "./_components/integration-card";

const APPS = [
  {
    id: "facebook",
    name: "Facebook",
    description: "Enable auto-reply for Facebook messages and comments.",
    connected: true,
    account: "Connected as SellPilot",
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Enable auto-reply for Instagram DMs and story replies.",
    connected: false,
    account: null,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Enable auto-reply for WhatsApp Business messages.",
    connected: false,
    account: null,
  },
];

export default async function IntegrationsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

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
