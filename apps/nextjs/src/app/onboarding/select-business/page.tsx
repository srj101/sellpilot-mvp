import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { SelectBusinessClient } from "./_components/select-business-client";

export default async function SelectStorePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.user.emailVerified) redirect("/verify-email");

  return <SelectBusinessClient />;
}
