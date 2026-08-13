import { NextRequest, NextResponse } from "next/server";
import { db } from "@acme/db/client";
import { product, productVariant, productImageEmbedding } from "@acme/db/schema";
import { queueProductImageIndexing } from "@acme/api/queue";

import { env } from "~/env";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Optional security check
  const authHeader = req.headers.get("authorization");
  if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allProducts = await db.select().from(product);
    const allVariants = await db.select().from(productVariant);
    const existingEmbeddings = await db
      .select({
        productId: productImageEmbedding.productId,
        variantId: productImageEmbedding.variantId,
        imageUrl: productImageEmbedding.imageUrl,
      })
      .from(productImageEmbedding);

    // Same key shape the old ChromaDB IDs used (variant:<id> / product:<id>:<imageUrl>),
    // now checked against Postgres in one query instead of ChromaDB's batched .get({ids}).
    const existingKeys = new Set(
      existingEmbeddings.map((e) => (e.variantId ? `variant:${e.variantId}` : `product:${e.productId}:${e.imageUrl}`)),
    );

    interface IndexJob {
      key: string;
      businessId: string;
      productId: string;
      variantId?: string;
      imageUrl: string;
      productTitle: string;
    }

    const potentialJobs: IndexJob[] = [];

    // 1. Process variants
    for (const variant of allVariants) {
      if (!variant.imageUrl) continue;

      // Find the product to get businessId and title
      const prod = allProducts.find((p) => p.id === variant.productId);
      if (!prod) continue;

      potentialJobs.push({
        key: `variant:${variant.id}`,
        businessId: prod.businessId,
        productId: prod.id,
        variantId: variant.id,
        imageUrl: variant.imageUrl,
        productTitle: `${prod.title} (${variant.title})`,
      });
    }

    // 2. Process product gallery images
    for (const prod of allProducts) {
      const images = prod.images || [];
      const prodVariants = allVariants.filter((v) => v.productId === prod.id);

      for (const imgUrl of images) {
        if (!imgUrl) continue;

        // Skip if this image is already used as a variant image
        const isVariantImage = prodVariants.some((v) => v.imageUrl === imgUrl);
        if (isVariantImage) continue;

        potentialJobs.push({
          key: `product:${prod.id}:${imgUrl}`,
          businessId: prod.businessId,
          productId: prod.id,
          imageUrl: imgUrl,
          productTitle: prod.title,
        });
      }
    }

    if (potentialJobs.length === 0) {
      return NextResponse.json({ message: "No product images found to check" });
    }

    const missingJobs = potentialJobs.filter((job) => !existingKeys.has(job.key));

    // Queue missing jobs
    for (const job of missingJobs) {
      queueProductImageIndexing({
        businessId: job.businessId,
        productId: job.productId,
        variantId: job.variantId,
        imageUrl: job.imageUrl,
        productTitle: job.productTitle,
      });
    }

    return NextResponse.json({
      checked: potentialJobs.length,
      missing: missingJobs.length,
      queuedCount: missingJobs.length,
      queued: missingJobs.map((j) => j.productTitle),
    });
  } catch (error) {
    console.error("[Cron Sync] Cron execution failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
