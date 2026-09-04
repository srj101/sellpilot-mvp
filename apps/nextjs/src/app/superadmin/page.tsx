import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { SuperadminClient } from "./_components/superadmin-client";

export default async function SuperadminPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const userRole = (session.user as { role?: string | null }).role;
  if (userRole !== "superadmin") redirect("/");

  const caller = await createCaller(await headers());
  const users = await caller.superadmin.listUsers();

  const user = {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  };

  return <SuperadminClient initialUsers={users} user={user} />;
}
