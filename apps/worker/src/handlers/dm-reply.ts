/**
 * DM Reply Handler
 * Handles auto-replies to direct messages from customers
 */

import type { Job, MetaDMReplyJob } from "@acme/queue";
import {
  MessagingService,
  type PlatformConnection,
} from "@acme/messaging";
import {
  createSalesAgent,
  type AgentInput,
  type ChatMessage,
} from "@acme/ai-agent";

import { loadConfig } from "../config.js";
import { RateLimiter } from "../middleware/rate-limiter.js";
import { CircuitBreaker } from "../middleware/circuit-breaker.js";

const config = loadConfig();
const messagingService = new MessagingService();
const rateLimiter = new RateLimiter({
  maxRequests: config.rateLimitPerHour,
  windowMs: 60 * 60 * 1000,
});

const circuitBreaker = new CircuitBreaker({
  timeout: config.aiTimeoutMs,
  errorThreshold: 5,
  resetTimeout: 30000,
  fallbackMessage: config.aiFallbackMessage,
});

// Dependency injection for conversation history
export interface ConversationHistoryProvider {
  getHistory(userId: string, threadId: string): Promise<ChatMessage[]>;
}

let historyProvider: ConversationHistoryProvider | null = null;

export function setHistoryProvider(provider: ConversationHistoryProvider): void {
  historyProvider = provider;
}

// Dependency injection for logging outbound messages
export interface OutboundLogger {
  logOutbound(
    job: MetaDMReplyJob,
    messageId: string | undefined,
    text: string
  ): Promise<void>;
}

let outboundLogger: OutboundLogger | null = null;

export function setOutboundLogger(logger: OutboundLogger): void {
  outboundLogger = logger;
}

/**
 * Handle a DM reply job
 */
export async function handleDMReply(job: Job<MetaDMReplyJob>): Promise<void> {
  const data = job.data;

  console.log(`[DMReply] Processing job ${job.id}`, {
    platform: data.platform,
    threadId: data.threadId,
    userId: data.userId,
  });

  // Check rate limit
  const rateLimitKey = `${data.platform}:${data.connectionId}`;
  const rateLimit = rateLimiter.check(rateLimitKey);

  if (!rateLimit.allowed) {
    console.warn(`[DMReply] Rate limited for ${rateLimitKey}`);
    return;
  }

  // Build connection for messaging
  const connection: PlatformConnection = {
    id: data.connectionId,
    platform: data.platform,
    userId: data.userId,
    accountId: data.accountId,
    accessToken: data.accessToken,
    isActive: true,
    connectedAt: new Date(),
  };

  // Get conversation history
  let history: ChatMessage[] = [];
  if (historyProvider) {
    try {
      history = await historyProvider.getHistory(data.userId, data.threadId);
    } catch (err) {
      console.error("[DMReply] Failed to load history:", err);
    }
  }

  // Build agent input
  const agentInput: AgentInput = {
    message: data.incomingMessage.text ?? "",
    images: data.incomingMessage.imageUrls,
    context: {
      userId: data.userId,
      threadId: data.threadId,
      platform: data.platform,
      customerId: data.recipientId,
      connectionContext: {
        platform: data.platform,
        accessToken: data.accessToken,
        accountId: data.accountId,
        recipientId: data.recipientId,
        connectionId: data.connectionId,
      },
    },
    history,
  };

  try {
    // Run AI with circuit breaker
    const response = await circuitBreaker.run(async () => {
      const agent = createSalesAgent({
        apiKey: config.openaiApiKey,
        baseUrl: config.openaiBaseUrl,
        model: config.openaiModel,
        debug: config.debug,
      });

      return agent.run(agentInput);
    });

    console.log(`[DMReply] Job ${job.id} generated response:`, {
      text: response.response.slice(0, 300),
      llmCalls: response.llmCalls,
      toolCalls: response.toolCalls?.map((tc) => tc.name),
    });

    // Send the response
    const result = await messagingService.sendMessage(connection, {
      platform: data.platform,
      recipientId: data.recipientId,
      text: response.response,
    });

    if (result.success) {
      console.log(`[DMReply] Reply sent: ${result.messageId}`);

      // Log the outbound message
      if (outboundLogger) {
        await outboundLogger.logOutbound(job.data, result.messageId, response.response);
      }
    } else {
      console.error(`[DMReply] Failed to send reply: ${result.error}`);
      throw new Error(result.error);
    }

    console.log(`[DMReply] Job ${job.id} completed`, {
      processingTime: response.processingTime,
      llmCalls: response.llmCalls,
      toolCalls: response.toolCalls?.length ?? 0,
    });
  } catch (err) {
    console.error(`[DMReply] Job ${job.id} failed:`, err);

    // Send fallback message if circuit is open
    if (circuitBreaker.isOpen()) {
      try {
        await messagingService.sendMessage(connection, {
          platform: data.platform,
          recipientId: data.recipientId,
          text: config.aiFallbackMessage,
        });
      } catch {
        // Ignore fallback send failure
      }
    }

    throw err;
  }
}
