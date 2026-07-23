import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { SelectStoreClient } from "./_components/select-store-client";

export default async function SelectStorePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <SelectStoreClient />;
}
