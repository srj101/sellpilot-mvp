import { NextRequest, NextResponse } from "next/server";
import { db } from "@acme/db/client";
import { product, productVariant } from "@acme/db/schema";
import { getOrCreateCollection } from "~/lib/chromadb";
import { queueProductImageIndexing } from "~/lib/queue";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Optional security check
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const collection = await getOrCreateCollection();
    if (!collection) {
      return NextResponse.json({ error: "ChromaDB offline or unavailable" }, { status: 503 });
    }

    const allProducts = await db.select().from(product);
    const allVariants = await db.select().from(productVariant);

    interface IndexJob {
      id: string;
      userId: string;
      productId: string;
      variantId?: string;
      imageUrl: string;
      productTitle: string;
    }

    const potentialJobs: IndexJob[] = [];

    // 1. Process variants
    for (const variant of allVariants) {
      if (!variant.imageUrl) continue;

      // Find the product to get userId and title
      const prod = allProducts.find((p) => p.id === variant.productId);
      if (!prod) continue;

      const chromaId = `variant:${variant.id}`;
      potentialJobs.push({
        id: chromaId,
        userId: prod.userId,
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

        const base64Url = Buffer.from(imgUrl).toString("base64").slice(0, 40);
        const chromaId = `product:${prod.id}:${base64Url}`;
        potentialJobs.push({
          id: chromaId,
          userId: prod.userId,
          productId: prod.id,
          imageUrl: imgUrl,
          productTitle: prod.title,
        });
      }
    }

    if (potentialJobs.length === 0) {
      return NextResponse.json({ message: "No product images found to check" });
    }

    // Batch query ChromaDB to see which IDs exist
    const batchSize = 100;
    const missingJobs: IndexJob[] = [];

    for (let i = 0; i < potentialJobs.length; i += batchSize) {
      const batch = potentialJobs.slice(i, i + batchSize);
      const batchIds = batch.map((job) => job.id);

      try {
        const existing = await collection.get({ ids: batchIds });
        const existingIds = new Set(existing.ids || []);

        for (const job of batch) {
          if (!existingIds.has(job.id)) {
            missingJobs.push(job);
          }
        }
      } catch (err) {
        console.error(`[Cron Sync] Error querying ChromaDB batch starting at ${i}:`, err);
        // If query fails, assume all in this batch are missing to be safe
        missingJobs.push(...batch);
      }
    }

    // Queue missing jobs
    for (const job of missingJobs) {
      queueProductImageIndexing({
        userId: job.userId,
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
