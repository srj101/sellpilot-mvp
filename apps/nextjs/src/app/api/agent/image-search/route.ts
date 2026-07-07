import { NextRequest, NextResponse } from "next/server";

import { and, eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { product } from "@acme/db/schema";

import { auth } from "~/auth/server";
import { searchProductsByImage } from "~/lib/chromadb";

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

  const matches = await searchProductsByImage({
    userId: session.user.id,
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
        eq(product.userId, session.user.id),
        inArray(product.id, productIds),
      ),
    );

  const enriched = matches.map((match) => ({
    ...match,
    product: products.find((prod) => prod.id === match.productId) ?? null,
  }));

  return NextResponse.json({ matches: enriched });
}
