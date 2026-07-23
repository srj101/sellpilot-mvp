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
import { initLLMCache, getLLMCache, type LLMCache } from "@acme/realtime";

import { loadConfig } from "../config.js";
import { RateLimiter } from "../middleware/rate-limiter.js";
import { CircuitBreaker } from "../middleware/circuit-breaker.js";

/**
 * Transcribe audio using OpenAI Whisper API
 */
async function transcribeAudio(audioUrl: string, apiKey: string): Promise<string> {
  const response = await fetch(audioUrl);
  if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
  const audioBuffer = await response.arrayBuffer();

  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer]), "audio.ogg");
  formData.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return data.text ?? "";
}

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

// LLM Response Cache
let llmCache: LLMCache | null = null;

export function initLLMCacheConnection(redisUrl: string): void {
  llmCache = initLLMCache({ ttl: 3600, clientScope: true });
  llmCache.connect(redisUrl).catch((err) => {
    console.error("[DMReply] LLM cache connection failed:", err);
    llmCache = null;
  });
}

// Dependency injection for conversation history
export interface ConversationHistoryProvider {
  getHistory(organizationId: string, threadId: string): Promise<ChatMessage[]>;
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
    organizationId: data.organizationId,
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
      history = await historyProvider.getHistory(data.organizationId, data.threadId);
    } catch (err) {
      console.error("[DMReply] Failed to load history:", err);
    }
  }

  // Handle voice messages - transcribe first
  let messageText = data.incomingMessage.text ?? "";
  const audioUrl = data.incomingMessage.audioUrls?.[0];
  if (!messageText && audioUrl) {
    try {
      messageText = await transcribeAudio(audioUrl, config.openaiApiKey);
      console.log(`[DMReply] Transcribed voice message: ${messageText.slice(0, 100)}`);
    } catch (err) {
      console.warn(`[DMReply] Failed to transcribe audio: ${audioUrl}`, err);
      messageText = "[Voice message - transcription failed]";
    }
  }

  // Build agent input
  const agentInput: AgentInput = {
    message: messageText,
    images: data.incomingMessage.imageUrls,
    context: {
      userId: data.userId,
      organizationId: data.organizationId,
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
    // Check LLM cache first (keyed by message + history hash + store)
    let responseText: string;

    if (llmCache?.isConnected()) {
      const cached = await llmCache.get(
        data.incomingMessage.text ?? "",
        history,
        data.organizationId,
        config.openaiModel
      );
      if (cached) {
        console.log(`[DMReply] Cache hit for job ${job.id}, using cached response`);
        responseText = cached.response;
      } else {
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

        responseText = response.response;

        // Cache the response
        await llmCache.set(
          data.incomingMessage.text ?? "",
          history,
          data.organizationId,
          config.openaiModel,
          responseText
        );
      }
    } else {
      // No cache, run AI directly
      const response = await circuitBreaker.run(async () => {
        const agent = createSalesAgent({
          apiKey: config.openaiApiKey,
          baseUrl: config.openaiBaseUrl,
          model: config.openaiModel,
          debug: config.debug,
        });

        return agent.run(agentInput);
      });
      responseText = response.response;
    }

    console.log(`[DMReply] Job ${job.id} generated response:`, {
      text: responseText.slice(0, 300),
    });

    // Send the response
    const result = await messagingService.sendMessage(connection, {
      platform: data.platform,
      recipientId: data.recipientId,
      text: responseText,
    });

    if (result.success) {
      console.log(`[DMReply] Reply sent: ${result.messageId}`);

      // Log the outbound message
      if (outboundLogger) {
        await outboundLogger.logOutbound(job.data, result.messageId, responseText);
      }
    } else {
      console.error(`[DMReply] Failed to send reply: ${result.error}`);
      throw new Error(result.error);
    }

    console.log(`[DMReply] Job ${job.id} completed`, {
      processingTime: Date.now() - (job.timestamp ?? Date.now()),
    });
  } catch (err) {
    console.error(`[DMReply] Job ${job.id} failed:`, err);

    // Send fallback message if circuit is open
    if (circuitBreaker.isOpen()) {
      try {
        const fallbackResult = await messagingService.sendMessage(connection, {
          platform: data.platform,
          recipientId: data.recipientId,
          text: config.aiFallbackMessage,
        });

        if (fallbackResult.success && outboundLogger) {
          await outboundLogger.logOutbound(job.data, fallbackResult.messageId, config.aiFallbackMessage);
        }
      } catch {
        // Ignore fallback send failure
      }
    }

    throw err;
  }
}
