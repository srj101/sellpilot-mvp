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
import type { ThreadCancelBroadcast } from "@acme/queue";
import { searchProductsByImage } from "@acme/api/vector-search";
import { getMetaContactName } from "@acme/api/resolve-contact-names";
import { getConversationSummary, generateAndSaveConversationSummary, getCustomerForThread } from "@acme/db/helpers/aiHelpers";

import { checkAiTokenAvailability, incrementAiToken } from "../lib/ai-tokens.js";
import { getBusinessPlanKey } from "../lib/plan.js";

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

/**
 * The configured chat model doesn't support image input on its hosted endpoint
 * ("Received multimodal data but multimodal processing is not enabled") — every
 * customer image message fails outright if sent to the chat model directly. Instead,
 * run it through the same NVIDIA embedding model already used to index the product
 * catalog (packages/api/src/lib/embeddings.ts, via vector-search.ts's
 * searchProductsByImage) to find the closest matching product, then hand the chat
 * model a text description it can reason about and verify with its own product
 * lookup tools — rather than the raw image, which it can't read anyway.
 */
async function describeImagesForAgent(businessId: string, imageUrls: string[]): Promise<string> {
  const notes = await Promise.all(
    imageUrls.map(async (imageUrl) => {
      const [match] = await searchProductsByImage({ businessId, imageUrl, limit: 1 });
      if (!match) return "an image with no close match found in the product catalog";
      return (
        `an image that visually best matches product "${match.productTitle}" ` +
        `(product ID: ${match.productId}, match distance ${match.distance.toFixed(3)} — lower is closer; ` +
        `confirm with a product lookup tool before relying on this, it may not be exact)`
      );
    })
  );
  return `[Customer also sent ${notes.join("; and ")}.]`;
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

// Cancel-and-restart: one entry per "businessId:threadId" for whichever reply is
// currently being generated on THIS process. When a newer message for the same
// thread arrives before the old reply finishes, the old one is aborted so the
// customer gets one reply that sees both messages instead of two disjointed ones.
//
// Each entry carries a random id alongside its controller. Cancellation (local or
// broadcast) always targets a specific id, never "whatever's currently in the map
// for this key" — pub/sub delivery is async, so a cancel message can arrive after a
// third message has already replaced the entry; matching by id (rather than key
// alone) means that stale message can only ever abort the exact generation it was
// meant for, never a newer one that happens to share the key.
interface InFlightEntry {
  id: string;
  controller: AbortController;
  // The message that was being replied to when superseded — conversation history
  // (getConversationHistory) is read from the raw webhook payload's .text field,
  // which is empty/absent for image-only messages, so an image is otherwise only
  // ever visible to the agent within the exact job that received it. If that job
  // gets cancelled before it runs, the image would be silently lost unless the
  // superseding job inherits it from here.
  incomingMessage: MetaDMReplyJob["incomingMessage"];
}
const inFlight = new Map<string, InFlightEntry>();

// Cross-process counterpart: multiple worker processes can pick up messages for the
// same thread with no guarantee they land on the same one, so a local map alone
// isn't enough once you scale out. Optional — only set when running the redis queue
// provider (see apps/worker/src/index.ts); a single dev process doesn't need it.
let cancelBroadcast: ThreadCancelBroadcast | null = null;

export function setThreadCancelBroadcast(broadcast: ThreadCancelBroadcast): void {
  cancelBroadcast = broadcast;
  broadcast.onCancel((key, cancelId) => {
    const entry = inFlight.get(key);
    if (entry?.id === cancelId) {
      entry.controller.abort();
    }
  });
}

// Dependency injection for conversation history
export interface ConversationHistoryProvider {
  getHistory(businessId: string, threadId: string): Promise<ChatMessage[]>;
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

// Dependency injection for the human-takeover check (FR-AGT-15)
export interface HandlingModeProvider {
  getHandlingMode(businessId: string, threadId: string): Promise<"ai" | "human">;
}

let handlingModeProvider: HandlingModeProvider | null = null;

export function setHandlingModeProvider(provider: HandlingModeProvider): void {
  handlingModeProvider = provider;
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
    businessId: data.businessId,
  });

  // Check rate limit
  const rateLimitKey = `${data.platform}:${data.connectionId}`;
  const rateLimit = rateLimiter.check(rateLimitKey);

  if (!rateLimit.allowed) {
    console.warn(`[DMReply] Rate limited for ${rateLimitKey}`);
    return;
  }

  // A staff member may have taken this thread over after this job was already enqueued —
  // checked here, right before generating a reply, not just at webhook-receipt time, so
  // that race can't slip an AI reply out after a human already jumped in.
  if (handlingModeProvider) {
    try {
      const mode = await handlingModeProvider.getHandlingMode(data.businessId, data.threadId);
      if (mode === "human") {
        console.log(`[DMReply] Thread ${data.threadId} is human-handled, skipping AI reply`);
        return;
      }
    } catch (err) {
      console.error("[DMReply] Failed to check handling mode, proceeding as AI-handled:", err);
    }
  }

  // Check AI token availability for this business subscription
  const hasTokens = await checkAiTokenAvailability(data.businessId);
  if (!hasTokens) {
    console.warn(`[DMReply] Business ${data.businessId} has exhausted their AI tokens.`);
    // Optionally we could send a fallback message here notifying the customer,
    // but typically it just falls back to human-only mode quietly.
    return;
  }

  // Cancel-and-restart: if a reply is still being generated for this exact thread
  // (this process or another one), it's now outdated — a fresh reply is about to run
  // that will see this message too. Abort it rather than let two replies race.
  const cancelKey = `${data.businessId}:${data.threadId}`;
  const superseded = inFlight.get(cancelKey);

  // Carry forward the cancelled message's content — text, images, audio — into this
  // job's own. This is the only path an image ever reaches the agent through if its
  // original job gets superseded before running (see the InFlightEntry comment).
  let incomingText = data.incomingMessage.text ?? "";
  let incomingImages = data.incomingMessage.imageUrls;
  let incomingAudio = data.incomingMessage.audioUrls;

  if (superseded) {
    console.log(`[DMReply] Superseding in-flight reply for ${cancelKey}`);
    superseded.controller.abort();
    void cancelBroadcast?.publishCancel(cancelKey, superseded.id);

    const prior = superseded.incomingMessage;
    if (prior.text) {
      incomingText = incomingText ? `${prior.text}\n${incomingText}` : prior.text;
    }
    if (prior.imageUrls?.length) {
      incomingImages = [...prior.imageUrls, ...(incomingImages ?? [])];
    }
    if (prior.audioUrls?.length) {
      incomingAudio = [...prior.audioUrls, ...(incomingAudio ?? [])];
    }
  }

  const thisController = new AbortController();
  const thisId = crypto.randomUUID();
  inFlight.set(cancelKey, {
    id: thisId,
    controller: thisController,
    incomingMessage: { text: incomingText, imageUrls: incomingImages, audioUrls: incomingAudio, timestamp: data.incomingMessage.timestamp },
  });

  // Resolved once per job — drives which tools are available (getAllTools) and the
  // recommendation-tier prompt instructions (buildSalesAgentSystemPrompt).
  const planKey = await getBusinessPlanKey(data.businessId);

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
      history = await historyProvider.getHistory(data.businessId, data.threadId);
    } catch (err) {
      console.error("[DMReply] Failed to load history:", err);
    }
  }

  // The customer's real Facebook/Instagram display name (not the delivery name they may
  // give at checkout, which can be someone else's for a gift order) — lets the agent
  // greet them by name like a human would. Cached ~1hr internally; returns null for
  // WhatsApp (no such lookup available) or if the Graph API call fails, both handled
  // by simply omitting the greeting context below rather than erroring the reply.
  const facebookName = await getMetaContactName(data.recipientId, data.platform, data.accessToken);
  const facebookFirstName = facebookName?.split(" ")[0];

  // Cached summary of the whole conversation so far — covers anything older than the
  // raw history window above can reach. May be up to one turn stale; refreshed in the
  // background after this reply is sent, see the fire-and-forget call further down.
  const conversationSummary = await getConversationSummary(data.businessId, data.threadId);

  // The real on-file delivery details, if this thread already has a linked customer —
  // handed to the model directly rather than trusting it to call trackOrder and
  // accurately relay the result. Confirmed necessary: even with that tool + an explicit
  // "never guess a previous phone number" prompt rule, the model still occasionally
  // fabricated a plausible-looking one instead of calling the tool. This removes the
  // opportunity to guess by just always providing the real value up front.
  const existingCustomer = await getCustomerForThread(data.businessId, data.threadId);
  const knownCustomer =
    existingCustomer?.phone && existingCustomer.address
      ? { name: existingCustomer.name, phone: existingCustomer.phone, address: existingCustomer.address }
      : undefined;

  // Handle voice messages - transcribe first
  let messageText = incomingText;
  const audioUrl = incomingAudio?.[0];
  if (!messageText && audioUrl) {
    try {
      messageText = await transcribeAudio(audioUrl, config.openaiApiKey);
      console.log(`[DMReply] Transcribed voice message: ${messageText.slice(0, 100)}`);
    } catch (err) {
      console.warn(`[DMReply] Failed to transcribe audio: ${audioUrl}`, err);
      messageText = "[Voice message - transcription failed]";
    }
  }

  // The chat model can't process images directly (see describeImagesForAgent) — turn
  // any into a text description the model can reason about and verify via tools.
  if (incomingImages?.length) {
    const imageContext = await describeImagesForAgent(data.businessId, incomingImages);
    messageText = messageText ? `${imageContext}\n${messageText}` : imageContext;
  }

  // Build agent input
  const agentInput: AgentInput = {
    message: messageText,
    context: {
      userId: data.userId,
      businessId: data.businessId,
      threadId: data.threadId,
      platform: data.platform,
      customerId: data.recipientId,
      customerName: facebookFirstName,
      conversationSummary: conversationSummary ?? undefined,
      knownCustomer,
      connectionContext: {
        platform: data.platform,
        accessToken: data.accessToken,
        accountId: data.accountId,
        recipientId: data.recipientId,
        connectionId: data.connectionId,
      },
      planKey,
    },
    history,
  };

  try {
    let responseText: string;
    let tokensUsed = 0;

    const response = await circuitBreaker.run(async (signal) => {
      const agent = createSalesAgent({
        apiKey: config.openaiApiKey,
        baseUrl: config.openaiBaseUrl,
        model: config.openaiModel,
        debug: config.debug,
        planKey,
      });

      // Combine the circuit breaker's own timeout signal with this job's cancel
      // signal — either one aborting stops the in-flight LLM call.
      return agent.run(agentInput, { signal: AbortSignal.any([signal, thisController.signal]) });
    });
    responseText = response.response;
    tokensUsed = response.tokensUsed?.total ?? 0;

    console.log(`[DMReply] Job ${job.id} generated response:`, {
      text: responseText.slice(0, 300),
      tokensUsed,
    });

    // Send the response
    const result = await messagingService.sendMessage(connection, {
      platform: data.platform,
      recipientId: data.recipientId,
      text: responseText,
    });

    if (result.success) {
      console.log(`[DMReply] Reply sent: ${result.messageId}`);

      if (tokensUsed > 0) {
        await incrementAiToken(data.businessId, tokensUsed).catch(err => {
          console.error(`[DMReply] Failed to increment tokens for ${data.businessId}:`, err);
        });
      }

      // Log the outbound message
      if (outboundLogger) {
        await outboundLogger.logOutbound(job.data, result.messageId, responseText);
      }

      // Refresh the cached conversation summary in the background — never awaited, so
      // it can't add latency to the customer's reply. Runs after logOutbound above so
      // this reply itself is included in what gets summarized for next time.
      void generateAndSaveConversationSummary(data.userId, data.businessId, data.threadId).catch((err) => {
        console.error(`[DMReply] Failed to refresh conversation summary for ${data.threadId}:`, err);
      });
    } else {
      console.error(`[DMReply] Failed to send reply: ${result.error}`);
      throw new Error(result.error);
    }

    console.log(`[DMReply] Job ${job.id} completed`, {
      processingTime: Date.now() - (job.timestamp ?? Date.now()),
    });
  } catch (err) {
    // A newer message for this same thread superseded this reply (see the top of this
    // function) — not a real failure. The fresh job already running will answer for
    // both messages, so exit quietly: no fallback message, no rethrow (rethrowing would
    // make BullMQ retry a job that's intentionally obsolete).
    if (thisController.signal.aborted) {
      console.log(`[DMReply] Job ${job.id} cancelled — superseded by a newer message on ${cancelKey}`);
      return;
    }

    console.error(`[DMReply] Job ${job.id} failed:`, err);

    // Only send the fallback on the last attempt BullMQ will make for this job — this
    // used to fire on every retry (job.attempts increments each time the handler re-runs
    // after a failure), so a customer could get the same "we'll get back to you" message
    // several times over as the job retried. One fallback message per original incoming
    // message, not one per attempt.
    //
    // Deliberately NOT gated on circuitBreaker.isOpen(): the breaker's error count is
    // global across every customer this worker processes, not per-job — a customer whose
    // 3 attempts all timed out could easily do so without ever coinciding with 5
    // consecutive process-wide errors, meaning the old `isOpen() && isFinalAttempt` check
    // could exhaust every retry and still send nothing at all. From this customer's side,
    // they sent a message and got total silence. Final attempt failing — for any reason —
    // is reason enough on its own to tell them we're on it.
    const isFinalAttempt = job.attempts >= job.maxAttempts - 1;
    if (isFinalAttempt) {
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
  } finally {
    // Only clear the map entry if it's still this job's own — a newer message may
    // have already replaced it, and that entry must not be clobbered.
    if (inFlight.get(cancelKey)?.id === thisId) {
      inFlight.delete(cancelKey);
    }
  }
}
