/**
 * Comment Reply Handler
 * Handles auto-replies to comments on posts
 */

import type { Job, MetaCommentReplyJob } from "@acme/queue";
import {
  MessagingService,
  type PlatformConnection,
} from "@acme/messaging";

import { loadConfig } from "../config.js";
import { RateLimiter } from "../middleware/rate-limiter.js";
import { CircuitBreaker } from "../middleware/circuit-breaker.js";
import { COMMENT_REPLY_SYSTEM_PROMPT } from "@acme/ai-agent";

const config = loadConfig();
const messagingService = new MessagingService();
const rateLimiter = new RateLimiter({
  maxRequests: config.rateLimitPerHour,
  windowMs: 60 * 60 * 1000,
});

const circuitBreaker = new CircuitBreaker({
  timeout: 15000, // Shorter timeout for comments
  errorThreshold: 5,
  resetTimeout: 30000,
  fallbackMessage:
    "Thanks for your comment! We've sent you a message with more details.",
});

// Simple LLM call for comment replies (no tools needed)
async function generateCommentReply(commentText: string): Promise<string> {
  // Use fetch directly to avoid complex dependencies
  const response = await fetch(
    config.openaiBaseUrl
      ? `${config.openaiBaseUrl}/chat/completions`
      : "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: config.openaiModel,
        max_tokens: 120,
        messages: [
          { role: "system", content: COMMENT_REPLY_SYSTEM_PROMPT },
          { role: "user", content: commentText },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0]?.message?.content?.trim() ?? "";
}

// Dependency injection for logging
export interface CommentLogger {
  logCommentReply(
    job: MetaCommentReplyJob,
    replyId: string | undefined,
    text: string
  ): Promise<void>;
}

let commentLogger: CommentLogger | null = null;

export function setCommentLogger(logger: CommentLogger): void {
  commentLogger = logger;
}

/**
 * Handle a comment reply job
 */
export async function handleCommentReply(
  job: Job<MetaCommentReplyJob>
): Promise<void> {
  const data = job.data;

  console.log(`[CommentReply] Processing job ${job.id}`, {
    platform: data.platform,
    commentId: data.commentId,
    userId: data.userId,
  });

  // Check rate limit
  const rateLimitKey = `${data.platform}:${data.connectionId}`;
  const rateLimit = rateLimiter.check(rateLimitKey);

  if (!rateLimit.allowed) {
    console.warn(`[CommentReply] Rate limited for ${rateLimitKey}`);
    return;
  }

  // Build connection for messaging
  const connection: PlatformConnection = {
    id: data.connectionId,
    platform: data.platform,
    userId: data.userId,
    accountId: data.commentId, // Not used for comment replies
    accessToken: data.accessToken,
    isActive: true,
    connectedAt: new Date(),
  };

  try {
    // Generate reply with circuit breaker
    const replyText = await circuitBreaker.run(async () => {
      return generateCommentReply(data.commentText);
    });

    // Send the reply
    const result = await messagingService.replyToComment(
      connection,
      data.commentId,
      replyText
    );

    if (result.success) {
      console.log(`[CommentReply] Reply sent: ${result.messageId}`);

      // Log the comment reply
      if (commentLogger) {
        await commentLogger.logCommentReply(job.data, result.messageId, replyText);
      }
    } else {
      console.error(`[CommentReply] Failed to send reply: ${result.error}`);
      throw new Error(result.error);
    }

    console.log(`[CommentReply] Job ${job.id} completed`);
  } catch (err) {
    console.error(`[CommentReply] Job ${job.id} failed:`, err);

    // Send fallback reply if circuit is open
    if (circuitBreaker.isOpen()) {
      const fallbackText = "Thanks for your comment! We've sent you a message with more details.";
      try {
        const fallbackResult = await messagingService.replyToComment(
          connection,
          data.commentId,
          fallbackText
        );

        if (fallbackResult.success && commentLogger) {
          await commentLogger.logCommentReply(job.data, fallbackResult.messageId, fallbackText);
        }
      } catch {
        // Ignore fallback send failure
      }
    }

    throw err;
  }
}
