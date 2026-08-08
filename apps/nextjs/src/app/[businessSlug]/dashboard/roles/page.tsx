import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { RolesClient } from "./roles-client";

export default async function RolesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
      <RolesClient />
  );
}
