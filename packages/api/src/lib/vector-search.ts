/**
 * Postgres/pgvector-backed replacement for the old ChromaDB vector store. Same three
 * exported functions and call signatures as the old chromadb.ts, so callers (queue.ts,
 * products.ts, and the two image-search API routes) only needed an import-path change.
 * Requires the Postgres `vector` extension enabled once (see
 * packages/db/enable-vector-extension.mjs) before `productImageEmbedding` rows can be
 * written — that's a one-time DB setup step, not a runtime dependency.
 */
import { cosineDistance, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { productImageEmbedding } from "@acme/db/schema";

import { getImageEmbedding } from "./embeddings";

export async function addProductImageToVectorDb(params: {
  businessId: string;
  productId: string;
  variantId?: string;
  imageUrl: string;
  productTitle: string;
}): Promise<void> {
  try {
    const embedding = await getImageEmbedding(params.imageUrl);
    await db.insert(productImageEmbedding).values({
      businessId: params.businessId,
      productId: params.productId,
      variantId: params.variantId ?? null,
      imageUrl: params.imageUrl,
      productTitle: params.productTitle,
      embedding,
    });
    console.log(`[VectorSearch] Successfully indexed image for product: ${params.productTitle}`);
  } catch (error) {
    console.error("[VectorSearch] Error adding image embedding:", error);
  }
}

export function deleteProductImageFromVectorDb(params: { variantId?: string; productId?: string }): void {
  // Defer to a new event loop tick so this runs fire-and-forget, without the caller
  // awaiting it — matches the old chromadb.ts behavior exactly.
  setTimeout(() => {
    void (async () => {
      try {
        if (params.variantId) {
          await db.delete(productImageEmbedding).where(eq(productImageEmbedding.variantId, params.variantId));
        } else if (params.productId) {
          await db.delete(productImageEmbedding).where(eq(productImageEmbedding.productId, params.productId));
        }
      } catch (error) {
        console.error("[VectorSearch] Error deleting image embedding:", error);
      }
    })();
  }, 0);
}

export interface VectorSearchResult {
  id: string;
  productId: string;
  variantId: string;
  imageUrl: string;
  productTitle: string;
  document: string;
  distance: number;
}

export async function searchProductsByImage(params: {
  businessId: string;
  imageUrl: string;
  limit?: number;
}): Promise<VectorSearchResult[]> {
  try {
    const embedding = await getImageEmbedding(params.imageUrl);
    // Built once, reused in both the select projection and the ORDER BY — standard
    // drizzle pattern for cosineDistance (see its JSDoc examples).
    const distance = cosineDistance(productImageEmbedding.embedding, embedding);

    const rows = await db
      .select({
        id: productImageEmbedding.id,
        productId: productImageEmbedding.productId,
        variantId: productImageEmbedding.variantId,
        imageUrl: productImageEmbedding.imageUrl,
        productTitle: productImageEmbedding.productTitle,
        distance,
      })
      .from(productImageEmbedding)
      // Scoped to this business only — never ranks or returns another tenant's vectors.
      .where(eq(productImageEmbedding.businessId, params.businessId))
      .orderBy(distance)
      .limit(params.limit ?? 5);

    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      variantId: row.variantId ?? "",
      imageUrl: row.imageUrl,
      productTitle: row.productTitle,
      document: row.productTitle,
      distance: Number(row.distance),
    }));
  } catch (error) {
    console.error("[VectorSearch] Error querying image embeddings:", error);
    return [];
  }
}
