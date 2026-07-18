/**
 * AWS SQS Queue Provider
 * For production deployments on AWS infrastructure
 * Also supports LocalStack for local development
 */

import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  CreateQueueCommand,
} from "@aws-sdk/client-sqs";
import type {
  QueueProvider,
  Job,
  JobOptions,
  JobHandler,
  QueueStats,
  QueueConfig,
} from "../types";

interface SQSMessage {
  id: string;
  name: string;
  data: unknown;
  attempts: number;
  maxAttempts: number;
  timestamp: number;
}

export class SQSQueueProvider implements QueueProvider {
  readonly name = "sqs";

  private client: SQSClient;
  private queueUrls = new Map<string, string>();
  private handlers = new Map<string, JobHandler>();
  private polling = new Map<string, boolean>();
  private pollIntervals = new Map<string, NodeJS.Timeout>();
  private queueUrlPrefix: string;
  private defaultJobOptions: JobOptions;
  private jobs = new Map<string, Job>();

  constructor(config: QueueConfig) {
    const sqs = config.sqs ?? {
      region: process.env.AWS_REGION ?? "us-east-1",
      queueUrlPrefix:
        process.env.SQS_QUEUE_URL_PREFIX ??
        "http://localhost:4566/000000000000",
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      endpoint: process.env.AWS_ENDPOINT_URL,
    };

    this.queueUrlPrefix = sqs.queueUrlPrefix;
    this.defaultJobOptions = config.defaultJobOptions ?? {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    };

    const clientConfig: ConstructorParameters<typeof SQSClient>[0] = {
      region: sqs.region,
    };

    if (sqs.accessKeyId && sqs.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: sqs.accessKeyId,
        secretAccessKey: sqs.secretAccessKey,
      };
    }

    if (sqs.endpoint) {
      clientConfig.endpoint = sqs.endpoint;
    }

    this.client = new SQSClient(clientConfig);

    console.log(`[SQSQueue] Initialized with region ${sqs.region}`);
  }

  private getQueueUrl(jobName: string): string {
    const cached = this.queueUrls.get(jobName);
    if (cached) return cached;

    const url = `${this.queueUrlPrefix}/${jobName}`;
    this.queueUrls.set(jobName, url);
    return url;
  }

  private async ensureQueueExists(jobName: string): Promise<string> {
    const queueUrl = this.getQueueUrl(jobName);

    try {
      await this.client.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: ["QueueArn"],
        })
      );
    } catch (err: any) {
      if (
        err.name === "QueueDoesNotExist" ||
        err.name === "AWS.SimpleQueueService.NonExistentQueue"
      ) {
        console.log(`[SQSQueue] Creating queue ${jobName}`);
        const result = await this.client.send(
          new CreateQueueCommand({
            QueueName: jobName,
            Attributes: {
              VisibilityTimeout: "300",
              MessageRetentionPeriod: "1209600", // 14 days
            },
          })
        );
        if (result.QueueUrl) {
          this.queueUrls.set(jobName, result.QueueUrl);
          return result.QueueUrl;
        }
      }
      throw err;
    }

    return queueUrl;
  }

  async enqueue<T>(
    jobName: string,
    data: T,
    options: JobOptions = {}
  ): Promise<string> {
    const queueUrl = await this.ensureQueueExists(jobName);
    const mergedOptions = { ...this.defaultJobOptions, ...options };

    const jobId =
      options.jobId ??
      `${jobName}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const message: SQSMessage = {
      id: jobId,
      name: jobName,
      data,
      attempts: 0,
      maxAttempts: mergedOptions.attempts ?? 3,
      timestamp: Date.now(),
    };

    const job: Job<T> = {
      id: jobId,
      name: jobName,
      data,
      attempts: 0,
      maxAttempts: message.maxAttempts,
      timestamp: message.timestamp,
    };
    this.jobs.set(jobId, job as Job);

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        DelaySeconds: mergedOptions.delay
          ? Math.min(Math.floor(mergedOptions.delay / 1000), 900)
          : undefined,
        MessageDeduplicationId: options.jobId,
      })
    );

    console.log(`[SQSQueue] Enqueued job ${jobId} for ${jobName}`);
    return jobId;
  }

  process<T>(jobName: string, handler: JobHandler<T>): void {
    if (this.handlers.has(jobName)) {
      console.warn(`[SQSQueue] Handler already registered for ${jobName}`);
      return;
    }

    this.handlers.set(jobName, handler as JobHandler);
    this.polling.set(jobName, true);
    this.startPolling(jobName);

    console.log(`[SQSQueue] Registered handler for ${jobName}`);
  }

  private async startPolling(jobName: string): Promise<void> {
    const handler = this.handlers.get(jobName);
    if (!handler) return;

    const queueUrl = await this.ensureQueueExists(jobName);

    const poll = async () => {
      if (!this.polling.get(jobName)) return;

      try {
        const response = await this.client.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20, // Long polling
            VisibilityTimeout: 300,
          })
        );

        for (const msg of response.Messages ?? []) {
          if (!msg.Body || !msg.ReceiptHandle) continue;

          try {
            const sqsMessage: SQSMessage = JSON.parse(msg.Body);
            sqsMessage.attempts++;

            const job: Job = {
              id: sqsMessage.id,
              name: sqsMessage.name,
              data: sqsMessage.data,
              attempts: sqsMessage.attempts,
              maxAttempts: sqsMessage.maxAttempts,
              timestamp: sqsMessage.timestamp,
              processedAt: Date.now(),
            };

            await handler(job);

            // Delete on success
            await this.client.send(
              new DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: msg.ReceiptHandle,
              })
            );

            console.log(`[SQSQueue] Job ${job.id} completed`);
          } catch (err) {
            console.error(`[SQSQueue] Job processing failed:`, err);
            // Message returns to queue after visibility timeout
          }
        }
      } catch (err) {
        console.error(`[SQSQueue] Polling error:`, err);
      }

      // Schedule next poll
      if (this.polling.get(jobName)) {
        const interval = setTimeout(poll, 1000);
        this.pollIntervals.set(jobName, interval);
      }
    };

    poll();
  }

  async getJob<T>(jobId: string): Promise<Job<T> | null> {
    return (this.jobs.get(jobId) as Job<T>) ?? null;
  }

  async getStats(queueName: string): Promise<QueueStats> {
    try {
      const queueUrl = this.getQueueUrl(queueName);
      const response = await this.client.send(
        new GetQueueAttributesCommand({
          QueueUrl: queueUrl,
          AttributeNames: [
            "ApproximateNumberOfMessages",
            "ApproximateNumberOfMessagesNotVisible",
            "ApproximateNumberOfMessagesDelayed",
          ],
        })
      );

      const attrs = response.Attributes ?? {};

      return {
        waiting: parseInt(attrs.ApproximateNumberOfMessages ?? "0"),
        active: parseInt(attrs.ApproximateNumberOfMessagesNotVisible ?? "0"),
        completed: 0, // SQS doesn't track this
        failed: 0, // SQS doesn't track this
        delayed: parseInt(attrs.ApproximateNumberOfMessagesDelayed ?? "0"),
      };
    } catch {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }
  }

  async pause(): Promise<void> {
    for (const key of this.polling.keys()) {
      this.polling.set(key, false);
      const interval = this.pollIntervals.get(key);
      if (interval) clearTimeout(interval);
    }
    console.log("[SQSQueue] Paused all polling");
  }

  async resume(): Promise<void> {
    for (const jobName of this.handlers.keys()) {
      this.polling.set(jobName, true);
      this.startPolling(jobName);
    }
    console.log("[SQSQueue] Resumed all polling");
  }

  async close(): Promise<void> {
    await this.pause();
    this.handlers.clear();
    this.queueUrls.clear();
    this.jobs.clear();
    this.client.destroy();
    console.log("[SQSQueue] Closed");
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Try to get attributes of any queue
      for (const queueUrl of this.queueUrls.values()) {
        await this.client.send(
          new GetQueueAttributesCommand({
            QueueUrl: queueUrl,
            AttributeNames: ["QueueArn"],
          })
        );
        return true;
      }
      return true; // No queues yet but client initialized
    } catch {
      return false;
    }
  }
}
