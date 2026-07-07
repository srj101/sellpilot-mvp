import { ChromaClient } from "chromadb";
import { getImageEmbedding } from "./embeddings";
import { env } from "~/env";

const getChromaConfig = () => {
  let urlString = env.CHROMA_URL;
  if (!urlString.startsWith("http://") && !urlString.startsWith("https://")) {
    urlString = "http://" + urlString;
  }
  const url = new URL(urlString);
  return {
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : (url.protocol === "https:" ? 443 : 80),
    ssl: url.protocol === "https:",
  };
};

const { host, port, ssl } = getChromaConfig();

const client = new ChromaClient({
  host,
  port,
  ssl,
  auth: env.CHROMA_AUTH_TOKEN
    ? {
        provider: "token",
        credentials: env.CHROMA_AUTH_TOKEN,
      }
    : undefined,
});

const COLLECTION_NAME = "product_images";

// Define a dummy embedding function to satisfy ChromaDB JS client v3.x without loading heavy models locally
const dummyEmbeddingFunction = {
  generate: async (texts: string[]): Promise<number[][]> => {
    // Return empty/zero vectors since we manually generate and pass embeddings in our calls
    return texts.map(() => new Array(512).fill(0));
  },
};

let isChromaDbOffline = false;
let lastCheckTime = 0;
const RETRY_INTERVAL = 30000; // 30 seconds

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 2000): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`ChromaDB operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

export async function getOrCreateCollection() {
  const now = Date.now();
  if (isChromaDbOffline && now - lastCheckTime < RETRY_INTERVAL) {
    return null;
  }

  try {
    const collection = await withTimeout(
      client.getOrCreateCollection({
        name: COLLECTION_NAME,
        embeddingFunction: dummyEmbeddingFunction,
      }),
      2000,
    );
    isChromaDbOffline = false; // Reset status on successful connection
    return collection;
  } catch (error) {
    isChromaDbOffline = true;
    lastCheckTime = now;
    console.warn(
      "[ChromaDB] Failed to get or create collection. Is ChromaDB running? Error:",
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

    await withTimeout(
      collection.add({
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
      }),
      2000,
    );
    console.log(
      `[ChromaDB] Successfully indexed image for product: ${params.productTitle}`,
    );
  } catch (error) {
    console.error("[ChromaDB] Error adding image to vector DB:", error);
  }
}

export function deleteProductImageFromVectorDb(params: {
  variantId?: string;
  productId?: string;
}) {
  // Defer execution to a new event loop tick to escape Next.js Server Action promise tracking
  setTimeout(async () => {
    try {
      const collection = await getOrCreateCollection();
      if (!collection) return;

      if (params.variantId) {
        await withTimeout(
          collection.delete({ ids: [`variant:${params.variantId}`] }),
          2000,
        );
      } else if (params.productId) {
        await withTimeout(
          collection.delete({
            where: { productId: params.productId },
          }),
          2000,
        );
      }
    } catch (error) {
      console.error("[ChromaDB] Error deleting image from vector DB:", error);
    }
  }, 0);
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

    const queryResult = await withTimeout(
      collection.query({
        queryEmbeddings: [embedding],
        nResults: params.limit ?? 5,
        where: {
          userId: params.userId,
        },
      }),
      2000,
    );

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
