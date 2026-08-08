import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { ProductsClient } from "./products-client";

export default async function ProductsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
      <ProductsClient />
  );
}
