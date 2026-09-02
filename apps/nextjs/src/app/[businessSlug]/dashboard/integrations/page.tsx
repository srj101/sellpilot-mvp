import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { IntegrationCard } from "./_components/integration-card";

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { businessSlug } = await params;
  const { error } = await searchParams;
  const caller = await createCaller(await headers());
  const [connections, membersData, channelAccess] = await Promise.all([
    caller.integrations.list(),
    caller.roles.listMembers(),
    caller.integrations.getChannelAccess(),
  ]);
  const allowedChannels = new Set(channelAccess.channels);

  // Determine if the current user is the business owner
  const currentUserId = session.user.id;
  const currentMember = membersData.members.find((m) => m.userId === currentUserId);
  const isOwner = currentMember?.role === "owner";

  /**
   * A channel is Connected if it has at least one active connection, Paused if it has
   * connections but every one of them is paused, and Not connected otherwise. Preferring
   * an active row matters once a merchant has several Pages: one paused Page must not make
   * the whole channel read as disconnected.
   */
  function channelState(platform: string, label: (name: string | null) => string) {
    const forPlatform = connections.filter((c) => c.platform === platform);
    const active = forPlatform.find((c) => c.status !== "paused");
    const chosen = active ?? forPlatform[0];
    return {
      connected: !!active,
      paused: !active && forPlatform.length > 0,
      account: chosen ? label(chosen.platformAccountName) : null,
    };
  }

  const APPS = [
    {
      id: "facebook",
      name: "Facebook",
      description: "Enable auto-reply for Facebook messages and comments.",
      ...channelState("facebook_page", (name) => `Connected as ${name}`),
      locked: !allowedChannels.has("messenger"),
    },
    {
      id: "instagram",
      name: "Instagram",
      description: "Enable auto-reply for Instagram DMs and story replies.",
      ...channelState("instagram", (name) => `@${name}`),
      locked: !allowedChannels.has("instagram"),
    },
    {
      id: "whatsapp",
      name: "WhatsApp",
      description: "Enable auto-reply for WhatsApp Business messages.",
      ...channelState("whatsapp", (name) => `Connected: ${name}`),
      locked: !allowedChannels.has("whatsapp"),
    },
  ];

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-1 text-base">
          {isOwner
            ? "Tap a channel to connect it and manage auto-replies."
            : "View connected channels. Only the business owner can connect or disconnect channels."}
        </p>
      </div>

      {!isOwner && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <span className="font-semibold">Read-only:</span>
          Connecting and disconnecting channels is restricted to the business owner.
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl">
        {APPS.map((app) => (
          <IntegrationCard key={app.id} {...app} businessSlug={businessSlug} isOwner={isOwner} />
        ))}
      </div>
    </>
  );
}

