/**
 * LLM Response Cache
 * Redis-based caching for LLM responses to avoid redundant API calls
 * Cache key = hash(message + clientId + model) for client-specific deduplication
 */

import Redis from "ioredis";
import hash from "hash-itout";
import type { LLMCacheEntry, LLMCacheOptions } from "./types";

const DEFAULT_TTL = 3600; // 1 hour

export class LLMCache {
  private redis: Redis | null = null;
  private ttl: number;
  private clientScope: boolean;

  constructor(options: LLMCacheOptions = {}) {
    this.ttl = options.ttl ?? DEFAULT_TTL;
    this.clientScope = options.clientScope ?? true;
  }

  async connect(url: string): Promise<void> {
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    await this.redis.connect();
  }

  /**
   * Generate cache key from message and context
   */
  private getCacheKey(
    message: string,
    history: unknown[],
    clientId: string,
    model: string
  ): string {
    const payload = this.clientScope
      ? { message, history, clientId, model }
      : { message, history, model };
    const hashValue = hash(payload);
    return `llm:cache:${hashValue}`;
  }

  /**
   * Get cached response if exists
   */
  async get(
    message: string,
    history: unknown[],
    clientId: string,
    model: string
  ): Promise<LLMCacheEntry | null> {
    if (!this.redis) return null;

    const key = this.getCacheKey(message, history, clientId, model);
    const cached = await this.redis.get(key);

    if (!cached) return null;

    try {
      const entry: LLMCacheEntry = JSON.parse(cached);

      // Check if expired (double-check beyond Redis TTL)
      if (Date.now() - entry.cachedAt > this.ttl * 1000) {
        await this.redis.del(key);
        return null;
      }

      return entry;
    } catch {
      return null;
    }
  }

  /**
   * Store LLM response in cache
   */
  async set(
    message: string,
    history: unknown[],
    clientId: string,
    model: string,
    response: string,
    tokenCount?: number
  ): Promise<void> {
    if (!this.redis) return;

    const key = this.getCacheKey(message, history, clientId, model);
    const entry: LLMCacheEntry = {
      response,
      model,
      cachedAt: Date.now(),
      tokenCount: tokenCount ?? Math.ceil(response.length / 4), // Rough estimate
    };

    await this.redis.setex(key, this.ttl, JSON.stringify(entry));
  }

  /**
   * Invalidate cache for a specific client
   */
  async invalidateClient(clientId: string): Promise<void> {
    if (!this.redis) return;

    const pattern = `llm:cache:*${clientId}*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return this.redis?.status === "ready";
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    await this.redis?.quit();
    this.redis = null;
  }
}

// Singleton for global use
let cacheInstance: LLMCache | null = null;

export function getLLMCache(): LLMCache {
  if (!cacheInstance) {
    cacheInstance = new LLMCache();
  }
  return cacheInstance;
}

export function initLLMCache(options?: LLMCacheOptions): LLMCache {
  cacheInstance = new LLMCache(options);
  return cacheInstance;
}