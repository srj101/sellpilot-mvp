import { Queue, Worker } from "bullmq";

import { env } from "@acme/env";
import { resolveRedisConnection } from "@acme/queue";

import { addProductImageToVectorDb } from "./vector-search";
import { refreshProductKeywords } from "./product-search-text";
import { db } from "@acme/db/client";

export interface ProductImageJobData {
  businessId: string;
  productId: string;
  variantId?: string;
  imageUrl: string;
  productTitle: string;
}

/**
 * Search-keyword generation for a product — an LLM call, so it belongs off the request
 * path for exactly the same reason image embedding does. Shares this queue rather than
 * opening a second Redis queue for one more job type; the worker branches on `kind`.
 */
export interface ProductKeywordJobData {
  kind: "keywords";
  businessId: string;
  productId: string;
  productTitle: string;
}

type ProductIndexJobData = ProductImageJobData | ProductKeywordJobData;

function isKeywordJob(data: ProductIndexJobData): data is ProductKeywordJobData {
  return "kind" in data && data.kind === "keywords";
}

const globalForQueue = globalThis as unknown as {
  productImageQueue: Queue<ProductIndexJobData> | undefined;
  productImageWorker: Worker<ProductIndexJobData> | undefined;
};

// Same discrete host/port/password/db/tls resolution packages/queue's
// RedisQueueProvider uses, so both queues always agree on which Redis to hit.
const redisConn = resolveRedisConnection();
const CONNECTION_OPTS = {
  host: redisConn.host,
  port: redisConn.port,
  password: redisConn.password,
  db: redisConn.db,
  ...(redisConn.tls ? { tls: {} } : {}),
};

export const productImageQueue =
  globalForQueue.productImageQueue ??
  new Queue<ProductIndexJobData>("product-images", {
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

if (env.NODE_ENV !== "production") {
  globalForQueue.productImageQueue = productImageQueue;
}

/**
 * Queue keyword generation for a product. Fire-and-forget: a merchant saving a product
 * must never wait on a model, and a model or Redis outage must never fail the save. The
 * product stays searchable by its own title and description throughout — keywords only
 * widen what finds it.
 */
export function queueProductKeywordIndexing(data: Omit<ProductKeywordJobData, "kind">) {
  setTimeout(() => {
    void (async () => {
      try {
        await productImageQueue.add("index-keywords", { ...data, kind: "keywords" });
        console.log(`[Queue] Successfully queued keyword indexing for: ${data.productTitle}`);
      } catch (error) {
        console.error("[Queue] Failed to queue keyword indexing:", error);
        // Same fallback as image indexing: with Redis unavailable, do the work inline
        // rather than silently leaving the product without keywords forever.
        void refreshProductKeywords(db, data.businessId, data.productId);
      }
    })();
  }, 0);
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
  new Worker<ProductIndexJobData>(
    "product-images",
    async (job) => {
      console.log(`[Queue Worker] Processing job ${job.id} for: ${job.data.productTitle}`);
      if (isKeywordJob(job.data)) {
        await refreshProductKeywords(db, job.data.businessId, job.data.productId);
        return;
      }
      await addProductImageToVectorDb(job.data);
    },
    {
      connection: CONNECTION_OPTS,
      concurrency: 2, // process 2 images at a time
    }
  );

if (env.NODE_ENV !== "production") {
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
