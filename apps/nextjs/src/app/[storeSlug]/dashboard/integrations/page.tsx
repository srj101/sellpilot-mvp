import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { IntegrationCard } from "./_components/integration-card";

export default async function IntegrationsPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { storeSlug } = await params;
  const caller = await createCaller(await headers());
  const [connections, membersData] = await Promise.all([
    caller.integrations.list(),
    caller.roles.listMembers(),
  ]);

  // Determine if the current user is the store owner
  const currentUserId = session.user.id;
  const currentMember = membersData.members.find((m) => m.userId === currentUserId);
  const isOwner = currentMember?.role === "owner";

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
          {isOwner
            ? "Tap a channel to connect it and manage auto-replies."
            : "View connected channels. Only the store owner can connect or disconnect channels."}
        </p>
      </div>

      {!isOwner && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <span className="font-semibold">Read-only:</span>
          Connecting and disconnecting channels is restricted to the store owner.
        </div>
      )}

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl">
        {APPS.map((app) => (
          <IntegrationCard key={app.id} {...app} storeSlug={storeSlug} isOwner={isOwner} />
        ))}
      </div>
    </DashboardShell>
  );
}

