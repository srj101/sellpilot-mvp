import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { StoreConnectionsClient } from "./_components/store-connections-client";

export default async function StoreConnectionsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const caller = await createCaller(await headers());
  const connections = await caller.storeConnections.list();

  return <StoreConnectionsClient connections={connections} />;
}
