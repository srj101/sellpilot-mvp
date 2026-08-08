import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { CustomersClient } from "./customers-client";

export default async function CustomersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
      <CustomersClient />
  );
}
