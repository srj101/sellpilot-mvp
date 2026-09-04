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
  ProcessHooks,
  QueueStats,
  QueueConfig,
} from "../types";
import { resolveRedisConnection } from "../broadcast";

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
    const redis = resolveRedisConnection(config.redis);

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
      jobId: safeJobId(options.jobId),
      delay: mergedOptions.delay,
      attempts: mergedOptions.attempts,
      backoff: mergedOptions.backoff,
      priority: mergedOptions.priority,
      // A caller passing an explicit jobId is always a stable, reused id for a
      // self-rescheduling loop (e.g. "conversation-followup-loop") — never a one-off job.
      // BullMQ keeps a job's record in Redis under its id even after it completes/fails
      // (that's what the default removeOnComplete/removeOnFail retention above is for),
      // and add() silently refuses to create a new job while a record with that id still
      // exists — including a *finished* one. Without this, the very first run of a fixed
      // id job would complete, its own retained record would then block every subsequent
      // re-enqueue attempt using the same id, and the "every 5 minutes forever" loop would
      // silently stop after exactly one run. Removing the record immediately on
      // completion/failure (only for these explicit-jobId jobs) frees the id for the next
      // cycle instead of leaving a corpse behind that blocks it.
      ...(options.jobId ? { removeOnComplete: true, removeOnFail: true } : {}),
    });

    console.log(`[RedisQueue] Enqueued job ${job.id} for ${jobName}`);
    return job.id!;
  }

  process<T>(jobName: string, handler: JobHandler<T>, hooks?: ProcessHooks<T>): void {
    if (this.workers.has(jobName)) {
      console.warn(`[RedisQueue] Handler already registered for ${jobName}`);
      return;
    }

    const toJob = (bullJob: BullJob<T>): Job<T> => ({
      id: bullJob.id!,
      name: bullJob.name,
      data: bullJob.data,
      attempts: bullJob.attemptsMade,
      maxAttempts: bullJob.opts.attempts ?? 3,
      timestamp: bullJob.timestamp,
      processedAt: bullJob.processedOn ?? undefined,
      failedReason: bullJob.failedReason,
    });

    const worker = new Worker<T>(
      jobName,
      async (bullJob: BullJob<T>) => {
        await handler(toJob(bullJob));
      },
      {
        connection: this.connection,
        concurrency: 5,
      }
    );

    worker.on("completed", (job) => {
      console.log(`[RedisQueue] Job ${job.id} completed`);
      hooks?.onCompleted?.(toJob(job));
    });

    worker.on("failed", (job, err) => {
      console.error(`[RedisQueue] Job ${job?.id} failed:`, err.message);
      // Only fire once attempts are truly exhausted — not on every retry attempt,
      // to match the old finally-block semantics (reschedule once the job is done
      // trying, whichever way it ended).
      if (job && job.attemptsMade < (job.opts.attempts ?? 1)) return;
      hooks?.onFailed?.(job ? toJob(job) : null, err);
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

/**
 * ":" is BullMQ's own Redis key separator, so it throws "Custom Id cannot contain :" on
 * any custom job id containing one. That is an implementation detail of this provider,
 * not something every call site should have to know — and when a call site did get it
 * wrong, the throw surfaced only as a swallowed log line while the feature silently did
 * nothing. Normalizing here keeps the colon impossible rather than merely discouraged.
 */
function safeJobId(jobId: string | undefined): string | undefined {
  return jobId?.replace(/:/g, "-");
}
