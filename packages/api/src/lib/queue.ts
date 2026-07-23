import { Queue, Worker } from "bullmq";

import { addProductImageToVectorDb } from "./chromadb";

export interface ProductImageJobData {
  organizationId: string;
  productId: string;
  variantId?: string;
  imageUrl: string;
  productTitle: string;
}

const globalForQueue = globalThis as unknown as {
  productImageQueue: Queue<ProductImageJobData> | undefined;
  productImageWorker: Worker<ProductImageJobData> | undefined;
};

const CONNECTION_OPTS = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
};

export const productImageQueue =
  globalForQueue.productImageQueue ??
  new Queue<ProductImageJobData>("product-images", {
    connection: {
      ...CONNECTION_OPTS,
      enableOfflineQueue: false, // Fail fast if Redis is down, prevents API calls from hanging
    },
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: { count: 1000 },
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForQueue.productImageQueue = productImageQueue;
}

export function queueProductImageIndexing(data: ProductImageJobData) {
  // Defer to a new event loop tick so this runs fire-and-forget, without the caller awaiting it.
  setTimeout(() => {
    void (async () => {
      try {
        await productImageQueue.add("index-image", data);
        console.log(`[Queue] Successfully queued image indexing for: ${data.productTitle}`);
      } catch (error) {
        console.error("[Queue] Failed to queue image indexing:", error);
        // Fallback to synchronous/async call directly if Redis is not available
        // to avoid breaking the application entirely.
        void addProductImageToVectorDb(data);
      }
    })();
  }, 0);
}

// Instantiate the Worker so that it starts processing jobs as soon as the module is imported
export const productImageWorker =
  globalForQueue.productImageWorker ??
  new Worker<ProductImageJobData>(
    "product-images",
    async (job) => {
      console.log(`[Queue Worker] Processing job ${job.id} for: ${job.data.productTitle}`);
      await addProductImageToVectorDb(job.data);
    },
    {
      connection: CONNECTION_OPTS,
      concurrency: 2, // process 2 images at a time
    }
  );

if (process.env.NODE_ENV !== "production") {
  globalForQueue.productImageWorker = productImageWorker;
}

// Log queue events
productImageQueue.on("error", (err) => {
  console.warn("[Queue] Redis connection warning:", err.message);
});

// Log worker events
productImageWorker.on("completed", (job) => {
  console.log(`[Queue Worker] Job ${job.id} completed successfully`);
});

productImageWorker.on("failed", (job, err) => {
  console.error(`[Queue Worker] Job ${job?.id} failed with error:`, err);
});

productImageWorker.on("error", (err) => {
  console.warn("[Queue Worker] Redis connection warning:", err.message);
});
