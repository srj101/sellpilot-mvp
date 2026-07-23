import { NextRequest, NextResponse } from "next/server";

import { and, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { product } from "@acme/db/schema";

import { auth } from "~/auth/server";
import { resolveActiveOrganizationId } from "~/lib/resolve-active-org";
import { searchProductsByImage } from "@acme/api/chromadb";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const imageUrl = body?.imageUrl;

  if (!imageUrl || typeof imageUrl !== "string") {
    return NextResponse.json(
      { error: "imageUrl is required and must be a string." },
      { status: 400 },
    );
  }

  const activeOrganizationId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId;
  const organizationId = await resolveActiveOrganizationId(session.user.id, activeOrganizationId);

  const matches = await searchProductsByImage({
    organizationId,
    imageUrl,
    limit: 5,
  });

  if (matches.length === 0) {
    return NextResponse.json({ matches: [] });
  }

  const productIds = Array.from(
    new Set(matches.map((match) => match.productId)),
  );
  const products = await db
    .select()
    .from(product)
    .where(
      and(
        eq(product.organizationId, organizationId),
        inArray(product.id, productIds),
      ),
    );

  const enriched = matches.map((match) => ({
    ...match,
    product: products.find((prod) => prod.id === match.productId) ?? null,
  }));

  return NextResponse.json({ matches: enriched });
}
