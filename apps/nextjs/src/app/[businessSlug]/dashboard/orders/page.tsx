import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { OrdersClient } from "./orders-client";

export default async function OrdersPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
      <OrdersClient />
  );
}
