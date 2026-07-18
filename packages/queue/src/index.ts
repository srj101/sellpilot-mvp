/**
 * Queue Package - Provider Abstraction Layer
 *
 * Supports multiple queue backends via environment variable:
 * - QUEUE_PROVIDER=memory (default, for local dev)
 * - QUEUE_PROVIDER=redis (BullMQ, for production)
 * - QUEUE_PROVIDER=sqs (AWS SQS, for AWS deployments)
 *
 * Usage:
 *   import { createQueue } from "@acme/queue";
 *   const queue = createQueue();
 *   await queue.enqueue("job-name", { data });
 *   queue.process("job-name", async (job) => { ... });
 */

import type {
  QueueProvider,
  QueueConfig,
  QueueProviderType,
  QueueJobMap,
  QueueJobName,
  JobOptions,
  JobHandler,
} from "./types";

import { MemoryQueueProvider } from "./providers/memory";
import { RedisQueueProvider } from "./providers/redis";
import { SQSQueueProvider } from "./providers/sqs";

export * from "./types";
export * from "./providers/index";

// Singleton instance
let queueInstance: QueueProvider | null = null;

/**
 * Create a queue provider based on configuration or environment variables.
 *
 * @param config - Optional configuration override
 * @returns Queue provider instance
 */
export function createQueue(config?: Partial<QueueConfig>): QueueProvider {
  if (queueInstance) {
    return queueInstance;
  }

  const provider = (config?.provider ??
    process.env.QUEUE_PROVIDER ??
    "memory") as QueueProviderType;

  const fullConfig: QueueConfig = {
    provider,
    redis: config?.redis,
    sqs: config?.sqs,
    defaultJobOptions: config?.defaultJobOptions ?? {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    },
  };

  console.log(`[Queue] Creating ${provider} provider`);

  switch (provider) {
    case "memory":
      queueInstance = new MemoryQueueProvider();
      break;
    case "redis":
      queueInstance = new RedisQueueProvider(fullConfig);
      break;
    case "sqs":
      queueInstance = new SQSQueueProvider(fullConfig);
      break;
    default:
      throw new Error(`Unknown queue provider: ${provider}`);
  }

  return queueInstance;
}

/**
 * Get the current queue instance (throws if not initialized)
 */
export function getQueue(): QueueProvider {
  if (!queueInstance) {
    throw new Error("Queue not initialized. Call createQueue() first.");
  }
  return queueInstance;
}

/**
 * Reset the queue instance (for testing)
 */
export async function resetQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}

/**
 * Type-safe queue wrapper for predefined job types
 */
export class TypedQueue {
  private queue: QueueProvider;

  constructor(queue?: QueueProvider) {
    this.queue = queue ?? createQueue();
  }

  /**
   * Enqueue a typed job
   */
  async enqueue<K extends QueueJobName>(
    jobName: K,
    data: QueueJobMap[K],
    options?: JobOptions
  ): Promise<string> {
    return this.queue.enqueue(jobName, data, options);
  }

  /**
   * Register a typed job handler
   */
  process<K extends QueueJobName>(
    jobName: K,
    handler: JobHandler<QueueJobMap[K]>
  ): void {
    this.queue.process(jobName, handler);
  }

  /**
   * Get the underlying queue provider
   */
  getProvider(): QueueProvider {
    return this.queue;
  }
}

/**
 * Create a type-safe queue wrapper
 */
export function createTypedQueue(config?: Partial<QueueConfig>): TypedQueue {
  return new TypedQueue(createQueue(config));
}
