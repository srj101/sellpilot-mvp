import { redirect } from "next/navigation";

import { desc, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { product, productVariant } from "@acme/db/schema";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { ProductsClient } from "./products-client";

export default async function ProductsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Load products owned by this tenant (userId)
  const products = await db
    .select()
    .from(product)
    .where(eq(product.userId, session.user.id))
    .orderBy(desc(product.createdAt));

  // Load associated variants safely
  const variants =
    products.length > 0
      ? await db
          .select()
          .from(productVariant)
          .where(inArray(productVariant.productId, products.map((p) => p.id)))
      : [];

  return (
    <DashboardShell>
      <ProductsClient initialProducts={products} initialVariants={variants} />
    </DashboardShell>
  );
}
