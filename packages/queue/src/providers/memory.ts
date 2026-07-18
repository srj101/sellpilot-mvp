/**
 * In-Memory Queue Provider
 * For local development and testing - no external dependencies
 */

import type {
  QueueProvider,
  Job,
  JobOptions,
  JobHandler,
  QueueStats,
} from "../types";

interface QueuedJob<T = unknown> {
  job: Job<T>;
  options: JobOptions;
  handler?: JobHandler<T>;
}

export class MemoryQueueProvider implements QueueProvider {
  readonly name = "memory";

  private queues = new Map<string, QueuedJob[]>();
  private handlers = new Map<string, JobHandler>();
  private jobs = new Map<string, Job>();
  private stats = new Map<
    string,
    { waiting: number; active: number; completed: number; failed: number; delayed: number }
  >();
  private processing = false;
  private paused = false;
  private timers: NodeJS.Timeout[] = [];

  async enqueue<T>(
    jobName: string,
    data: T,
    options: JobOptions = {}
  ): Promise<string> {
    const jobId = options.jobId ?? `${jobName}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const job: Job<T> = {
      id: jobId,
      name: jobName,
      data,
      attempts: 0,
      maxAttempts: options.attempts ?? 3,
      timestamp: Date.now(),
    };

    this.jobs.set(jobId, job as Job);

    const queue = this.queues.get(jobName) ?? [];
    queue.push({ job: job as Job, options });
    this.queues.set(jobName, queue);

    this.updateStats(jobName, "waiting", 1);

    const delay = options.delay ?? 0;

    const timer = setTimeout(() => {
      this.processJob(jobName, jobId);
    }, delay);

    this.timers.push(timer);

    console.log(`[MemoryQueue] Enqueued job ${jobId} for ${jobName}`);
    return jobId;
  }

  process<T>(jobName: string, handler: JobHandler<T>): void {
    this.handlers.set(jobName, handler as JobHandler);
    console.log(`[MemoryQueue] Registered handler for ${jobName}`);
  }

  private async processJob(jobName: string, jobId: string): Promise<void> {
    if (this.paused) {
      console.log(`[MemoryQueue] Paused, skipping job ${jobId}`);
      return;
    }

    const handler = this.handlers.get(jobName);
    if (!handler) {
      console.warn(`[MemoryQueue] No handler for ${jobName}`);
      return;
    }

    const job = this.jobs.get(jobId);
    if (!job) {
      console.warn(`[MemoryQueue] Job ${jobId} not found`);
      return;
    }

    this.updateStats(jobName, "waiting", -1);
    this.updateStats(jobName, "active", 1);

    job.attempts++;
    job.processedAt = Date.now();

    try {
      await handler(job);
      this.updateStats(jobName, "active", -1);
      this.updateStats(jobName, "completed", 1);
      console.log(`[MemoryQueue] Job ${jobId} completed`);
    } catch (err) {
      this.updateStats(jobName, "active", -1);

      const queue = this.queues.get(jobName) ?? [];
      const queuedJob = queue.find((q) => q.job.id === jobId);
      const maxAttempts = queuedJob?.options.attempts ?? 3;

      if (job.attempts < maxAttempts) {
        const backoff = queuedJob?.options.backoff;
        const delay = backoff
          ? backoff.type === "exponential"
            ? backoff.delay * Math.pow(2, job.attempts - 1)
            : backoff.delay
          : 1000 * job.attempts;

        console.log(
          `[MemoryQueue] Job ${jobId} failed, retrying in ${delay}ms (attempt ${job.attempts}/${maxAttempts})`
        );

        this.updateStats(jobName, "delayed", 1);

        const timer = setTimeout(() => {
          this.updateStats(jobName, "delayed", -1);
          this.processJob(jobName, jobId);
        }, delay);

        this.timers.push(timer);
      } else {
        job.failedReason = err instanceof Error ? err.message : String(err);
        this.updateStats(jobName, "failed", 1);
        console.error(
          `[MemoryQueue] Job ${jobId} failed permanently:`,
          job.failedReason
        );
      }
    }
  }

  private updateStats(
    queueName: string,
    key: keyof QueueStats,
    delta: number
  ): void {
    const current = this.stats.get(queueName) ?? {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
    current[key] += delta;
    this.stats.set(queueName, current);
  }

  async getJob<T>(jobId: string): Promise<Job<T> | null> {
    return (this.jobs.get(jobId) as Job<T>) ?? null;
  }

  async getStats(queueName: string): Promise<QueueStats> {
    return (
      this.stats.get(queueName) ?? {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      }
    );
  }

  async pause(): Promise<void> {
    this.paused = true;
    console.log("[MemoryQueue] Paused");
  }

  async resume(): Promise<void> {
    this.paused = false;
    console.log("[MemoryQueue] Resumed");
  }

  async close(): Promise<void> {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
    this.queues.clear();
    this.handlers.clear();
    this.jobs.clear();
    this.stats.clear();
    console.log("[MemoryQueue] Closed");
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
