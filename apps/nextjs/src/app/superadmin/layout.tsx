import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { SuperadminShell } from "./_components/superadmin-shell";

export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const userRole = (session.user as { role?: string | null }).role;
  if (userRole !== "superadmin") redirect("/");

  const user = {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  };

  return <SuperadminShell user={user}>{children}</SuperadminShell>;
}
