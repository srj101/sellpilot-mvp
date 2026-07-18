/**
 * Rate Limiter Middleware
 * Token bucket implementation for rate limiting
 */

export interface RateLimiterConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

interface BucketEntry {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private config: RateLimiterConfig;
  private buckets = new Map<string, BucketEntry>();

  constructor(config: RateLimiterConfig) {
    this.config = config;
  }

  /**
   * Check if a request is allowed
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.config.maxRequests,
        lastRefill: now,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on time passed
    const timePassed = now - bucket.lastRefill;
    const refillRate = this.config.maxRequests / this.config.windowMs;
    const tokensToAdd = Math.floor(timePassed * refillRate);

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(
        this.config.maxRequests,
        bucket.tokens + tokensToAdd
      );
      bucket.lastRefill = now;
    }

    // Check if request is allowed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetAt: new Date(now + this.config.windowMs),
      };
    }

    // Calculate when tokens will be available
    const timeUntilRefill = Math.ceil(1 / refillRate);

    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(now + timeUntilRefill),
    };
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Get current status without consuming a token
   */
  status(key: string): RateLimitResult {
    const bucket = this.buckets.get(key);

    if (!bucket) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetAt: new Date(Date.now() + this.config.windowMs),
      };
    }

    return {
      allowed: bucket.tokens >= 1,
      remaining: Math.floor(bucket.tokens),
      resetAt: new Date(bucket.lastRefill + this.config.windowMs),
    };
  }

  /**
   * Clean up old entries
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = this.config.windowMs * 2;

    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > maxAge) {
        this.buckets.delete(key);
      }
    }
  }
}
