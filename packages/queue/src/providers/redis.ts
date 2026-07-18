/**
 * Redis Queue Provider (BullMQ)
 * Production-ready queue with Redis backend
 */

import { Queue, Worker, type Job as BullJob } from "bullmq";
import type {
  QueueProvider,
  Job,
  JobOptions,
  JobHandler,
  QueueStats,
  QueueConfig,
} from "../types";

export class RedisQueueProvider implements QueueProvider {
  readonly name = "redis";

  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();
  private connection: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    tls?: object;
    maxRetriesPerRequest: null;
  };
  private defaultJobOptions: JobOptions;

  constructor(config: QueueConfig) {
    const redis = config.redis ?? {
      host: process.env.REDIS_HOST ?? "localhost",
      port: parseInt(process.env.REDIS_PORT ?? "6379"),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB ?? "0"),
    };

    this.connection = {
      host: redis.host,
      port: redis.port,
      password: redis.password,
      db: redis.db,
      // Required by BullMQ's Worker for its blocking commands — without this,
      // ioredis hits its retry cap and the worker floods "error" events.
      maxRetriesPerRequest: null,
      ...(redis.tls ? { tls: {} } : {}),
    };

    this.defaultJobOptions = config.defaultJobOptions ?? {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    };

    console.log(`[RedisQueue] Connecting to ${redis.host}:${redis.port}`);
  }

  private getQueue(jobName: string): Queue {
    let queue = this.queues.get(jobName);
    if (!queue) {
      queue = new Queue(jobName, {
        connection: this.connection,
        defaultJobOptions: {
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      });

      queue.on("error", (err) => {
        console.error(`[RedisQueue] Queue ${jobName} error:`, err.message);
      });

      this.queues.set(jobName, queue);
    }
    return queue;
  }

  async enqueue<T>(
    jobName: string,
    data: T,
    options: JobOptions = {}
  ): Promise<string> {
    const queue = this.getQueue(jobName);

    const mergedOptions = { ...this.defaultJobOptions, ...options };

    const job = await queue.add(jobName, data, {
      jobId: options.jobId,
      delay: mergedOptions.delay,
      attempts: mergedOptions.attempts,
      backoff: mergedOptions.backoff,
      priority: mergedOptions.priority,
    });

    console.log(`[RedisQueue] Enqueued job ${job.id} for ${jobName}`);
    return job.id!;
  }

  process<T>(jobName: string, handler: JobHandler<T>): void {
    if (this.workers.has(jobName)) {
      console.warn(`[RedisQueue] Handler already registered for ${jobName}`);
      return;
    }

    const worker = new Worker<T>(
      jobName,
      async (bullJob: BullJob<T>) => {
        const job: Job<T> = {
          id: bullJob.id!,
          name: bullJob.name,
          data: bullJob.data,
          attempts: bullJob.attemptsMade,
          maxAttempts: bullJob.opts.attempts ?? 3,
          timestamp: bullJob.timestamp,
          processedAt: Date.now(),
        };

        await handler(job);
      },
      {
        connection: this.connection,
        concurrency: 5,
      }
    );

    worker.on("completed", (job) => {
      console.log(`[RedisQueue] Job ${job.id} completed`);
    });

    worker.on("failed", (job, err) => {
      console.error(`[RedisQueue] Job ${job?.id} failed:`, err.message);
    });

    worker.on("error", (err) => {
      console.error(`[RedisQueue] Worker ${jobName} error:`, err.message);
    });

    this.workers.set(jobName, worker);
    console.log(`[RedisQueue] Registered handler for ${jobName}`);
  }

  async getJob<T>(jobId: string): Promise<Job<T> | null> {
    for (const queue of this.queues.values()) {
      const bullJob = await queue.getJob(jobId);
      if (bullJob) {
        return {
          id: bullJob.id!,
          name: bullJob.name,
          data: bullJob.data as T,
          attempts: bullJob.attemptsMade,
          maxAttempts: bullJob.opts.attempts ?? 3,
          timestamp: bullJob.timestamp,
          processedAt: bullJob.processedOn,
          failedReason: bullJob.failedReason,
        };
      }
    }
    return null;
  }

  async getStats(queueName: string): Promise<QueueStats> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  async pause(): Promise<void> {
    await Promise.all(
      Array.from(this.workers.values()).map((w) => w.pause())
    );
    console.log("[RedisQueue] Paused all workers");
  }

  async resume(): Promise<void> {
    await Promise.all(
      Array.from(this.workers.values()).map((w) => w.resume())
    );
    console.log("[RedisQueue] Resumed all workers");
  }

  async close(): Promise<void> {
    await Promise.all([
      ...Array.from(this.queues.values()).map((q) => q.close()),
      ...Array.from(this.workers.values()).map((w) => w.close()),
    ]);
    this.queues.clear();
    this.workers.clear();
    console.log("[RedisQueue] Closed all connections");
  }

  async isHealthy(): Promise<boolean> {
    try {
      for (const queue of this.queues.values()) {
        await queue.getWaitingCount();
        return true;
      }
      // No queues yet, try creating a test one
      const testQueue = new Queue("health-check", {
        connection: this.connection,
      });
      await testQueue.getWaitingCount();
      await testQueue.close();
      return true;
    } catch {
      return false;
    }
  }
}
