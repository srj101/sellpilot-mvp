import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { ProductsClient } from "./products-client";

export default async function ProductsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const caller = await createCaller(await headers());
  const { products, variants } = await caller.products.list();

  return (
    <DashboardShell>
      <ProductsClient initialProducts={products} initialVariants={variants} />
    </DashboardShell>
  );
}
