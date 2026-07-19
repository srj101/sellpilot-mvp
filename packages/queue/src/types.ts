/**
 * Queue package type definitions
 * Provides a unified interface for different queue providers
 */

export type QueueProviderType = "memory" | "redis" | "sqs";

export interface JobOptions {
  /** Delay before processing in milliseconds */
  delay?: number;
  /** Number of retry attempts */
  attempts?: number;
  /** Backoff strategy */
  backoff?: {
    type: "exponential" | "fixed";
    delay: number;
  };
  /** Job priority (lower = higher priority) */
  priority?: number;
  /** Custom job ID for deduplication */
  jobId?: string;
  /** Time-to-live in milliseconds */
  ttl?: number;
}

export interface Job<T = unknown> {
  id: string;
  name: string;
  data: T;
  attempts: number;
  maxAttempts: number;
  timestamp: number;
  processedAt?: number;
  failedReason?: string;
}

export interface JobResult {
  id: string;
  success: boolean;
  error?: string;
}

export type JobHandler<T = unknown> = (job: Job<T>) => Promise<void>;

export interface QueueProvider {
  /** Provider name for logging */
  readonly name: string;

  /** Enqueue a job for processing */
  enqueue<T>(jobName: string, data: T, options?: JobOptions): Promise<string>;

  /** Register a job handler */
  process<T>(jobName: string, handler: JobHandler<T>): void;

  /** Get job by ID */
  getJob<T>(jobId: string): Promise<Job<T> | null>;

  /** Get queue stats */
  getStats(queueName: string): Promise<QueueStats>;

  /** Pause processing */
  pause(): Promise<void>;

  /** Resume processing */
  resume(): Promise<void>;

  /** Close all connections */
  close(): Promise<void>;

  /** Check if provider is healthy */
  isHealthy(): Promise<boolean>;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueueConfig {
  /** Queue provider type */
  provider: QueueProviderType;

  /** Redis configuration */
  redis?: {
    host: string;
    port: number;
    password?: string;
    tls?: boolean;
    db?: number;
  };

  /** AWS SQS configuration */
  sqs?: {
    region: string;
    queueUrlPrefix: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string; // For LocalStack
  };

  /** Default job options */
  defaultJobOptions?: JobOptions;
}

/** Job types for the messaging system */
export interface MetaDMReplyJob {
  eventId: string;
  platform: "facebook_page" | "instagram" | "whatsapp";
  connectionId: string;
  userId: string;
  recipientId: string;
  threadId: string;
  incomingMessage: {
    text?: string;
    imageUrls?: string[];
    audioUrls?: string[];
    timestamp: number;
  };
  accessToken: string;
  accountId: string;
}

export interface MetaCommentReplyJob {
  eventId: string;
  platform: "facebook_page" | "instagram";
  connectionId: string;
  userId: string;
  commentId: string;
  commentText: string;
  accessToken: string;
}

export interface ProductImageIndexJob {
  userId: string;
  productId: string;
  variantId?: string;
  imageUrl: string;
  productTitle: string;
}

export type QueueJobMap = {
  "meta-dm-reply": MetaDMReplyJob;
  "meta-comment-reply": MetaCommentReplyJob;
  "product-image-index": ProductImageIndexJob;
};

export type QueueJobName = keyof QueueJobMap;
