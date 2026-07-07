import { ChromaClient } from "chromadb";
import { getImageEmbedding } from "./embeddings";

const client = new ChromaClient({
  path: process.env.CHROMADB_URL || "http://localhost:8000",
});

const COLLECTION_NAME = "product_images";

export async function getOrCreateCollection() {
  try {
    return await client.getOrCreateCollection({
      name: COLLECTION_NAME,
    });
  } catch (error) {
    console.warn(
      "[ChromaDB] Failed to get or create collection. Is ChromaDB running?",
      error,
    );
    return null;
  }
}

export async function addProductImageToVectorDb(params: {
  userId: string;
  productId: string;
  variantId?: string;
  imageUrl: string;
  productTitle: string;
}) {
  try {
    const collection = await getOrCreateCollection();
    if (!collection) return;

    const embedding = await getImageEmbedding(params.imageUrl);
    const id = params.variantId
      ? `variant:${params.variantId}`
      : `product:${params.productId}:${Buffer.from(params.imageUrl)
          .toString("base64")
          .slice(0, 40)}`;

    await collection.add({
      ids: [id],
      embeddings: [embedding],
      metadatas: [
        {
          userId: params.userId,
          productId: params.productId,
          variantId: params.variantId ?? "",
          imageUrl: params.imageUrl,
          productTitle: params.productTitle,
        },
      ],
      documents: [params.productTitle],
    });
    console.log(
      `[ChromaDB] Successfully indexed image for product: ${params.productTitle}`,
    );
  } catch (error) {
    console.error("[ChromaDB] Error adding image to vector DB:", error);
  }
}

export async function deleteProductImageFromVectorDb(params: {
  variantId?: string;
  productId?: string;
}) {
  try {
    const collection = await getOrCreateCollection();
    if (!collection) return;

    if (params.variantId) {
      await collection.delete({ ids: [`variant:${params.variantId}`] });
    } else if (params.productId) {
      await collection.delete({
        where: { productId: params.productId },
      });
    }
  } catch (error) {
    console.error("[ChromaDB] Error deleting image from vector DB:", error);
  }
}

export interface ChromaSearchResult {
  id: string;
  productId: string;
  variantId: string;
  imageUrl: string;
  productTitle: string;
  document: string;
  distance: number;
}

export async function searchProductsByImage(params: {
  userId: string;
  imageUrl: string;
  limit?: number;
}): Promise<ChromaSearchResult[]> {
  try {
    const collection = await getOrCreateCollection();
    if (!collection) return [];

    const embedding = await getImageEmbedding(params.imageUrl);

    const queryResult = await collection.query({
      queryEmbeddings: [embedding],
      nResults: params.limit ?? 5,
      where: {
        userId: params.userId,
      },
    });

    const results: ChromaSearchResult[] = [];
    if (queryResult.ids && queryResult.ids[0]) {
      for (let i = 0; i < queryResult.ids[0].length; i++) {
        const id = queryResult.ids[0][i];
        const metadata = queryResult.metadatas[0]?.[i];
        const distance = queryResult.distances?.[0]?.[i] ?? 0;
        const document = queryResult.documents[0]?.[i] ?? "";

        if (id && metadata) {
          results.push({
            id,
            productId: String(metadata.productId),
            variantId: String(metadata.variantId),
            imageUrl: String(metadata.imageUrl),
            productTitle: String(metadata.productTitle),
            document,
            distance,
          });
        }
      }
    }
    return results;
  } catch (error) {
    console.error("[ChromaDB] Error querying vector DB:", error);
    return [];
  }
}
