/**
 * AI Agent Package
 *
 * Unified AI agent for handling customer conversations across platforms.
 *
 * Usage:
 *   import { createSalesAgent, initializeHelpers } from "@acme/ai-agent";
 *
 *   // Initialize helpers (do this once at app startup)
 *   initializeHelpers({ aiHelpers, orderHelpers, businessHelpers });
 *
 *   // Create agent
 *   const agent = createSalesAgent({ apiKey, model });
 *
 *   // Run conversation
 *   const result = await agent.run({
 *     message: "What products do you have?",
 *     context: { userId, threadId, platform, customerId },
 *   });
 */

export * from "./types";
export * from "./prompts";
export * from "./tools/index";
export { SalesAgentGraph, SimpleChatAgent } from "./graph";

import type { AgentConfig, AgentInput, AgentOutput } from "./types";
import { SalesAgentGraph, SimpleChatAgent } from "./graph";
import {
  setAIHelpers,
  setOrderHelpers,
  setBusinessHelpers,
  setCheckoutHelpers,
  setMediaSendFunction,
  type AIHelpers,
  type OrderHelpers,
  type BusinessHelpers,
  type CheckoutHelpers,
  type SendImageFunction,
} from "./tools/index";

// ============================================
// Initialization
// ============================================

export interface HelpersConfig {
  aiHelpers: AIHelpers;
  orderHelpers: OrderHelpers;
  businessHelpers: BusinessHelpers;
  checkoutHelpers: CheckoutHelpers;
  sendImageFn?: SendImageFunction;
}

/**
 * Initialize all helpers (call once at app startup)
 */
export function initializeHelpers(config: HelpersConfig): void {
  setAIHelpers(config.aiHelpers);
  setOrderHelpers(config.orderHelpers);
  setBusinessHelpers(config.businessHelpers);
  setCheckoutHelpers(config.checkoutHelpers);

  if (config.sendImageFn) {
    setMediaSendFunction(config.sendImageFn);
  }

  console.log("[AI Agent] Helpers initialized");
}

// ============================================
// Agent Factory
// ============================================

interface AgentOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  debug?: boolean;
  /** Use simple chat without tools (for providers that don't support function calling) */
  simple?: boolean;
}

/**
 * Create a sales agent with the given configuration
 */
export function createSalesAgent(options: AgentOptions = {}): {
  run: (input: AgentInput) => Promise<AgentOutput>;
} {
  const config: AgentConfig = {
    apiKey: options.apiKey ?? process.env.OPENAI_API_KEY ?? "",
    baseUrl: options.baseUrl ?? process.env.OPENAI_BASE_URL,
    model: options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: options.temperature ?? 0.7,
    maxTokens: options.maxTokens ?? 800,
    debug: options.debug ?? process.env.NODE_ENV !== "production",
  };

  // Tool-calling is required for product lookups, pricing, and order creation/tracking.
  // Only disable it if the caller explicitly opts out (e.g. the configured model/provider
  // is confirmed not to support function calling) — never guess from the base URL.
  if (options.simple) {
    console.log("[AI Agent] Using simple chat mode (no tools)");
    return new SimpleChatAgent(config);
  }

  return new SalesAgentGraph(config);
}

// ============================================
// Singleton Agent
// ============================================

let defaultAgent: ReturnType<typeof createSalesAgent> | null = null;

/**
 * Get the default agent instance
 */
export function getDefaultAgent(): ReturnType<typeof createSalesAgent> {
  if (!defaultAgent) {
    defaultAgent = createSalesAgent();
  }
  return defaultAgent;
}

/**
 * Reset the default agent (for testing or config changes)
 */
export function resetDefaultAgent(): void {
  defaultAgent = null;
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Run a conversation with the default agent
 */
export async function runConversation(input: AgentInput): Promise<AgentOutput> {
  return getDefaultAgent().run(input);
}

/**
 * Quick helper to run a simple message
 */
export async function chat(
  message: string,
  context: {
    userId: string;
    threadId?: string;
    platform?: "facebook_page" | "instagram" | "whatsapp";
    customerId?: string;
  }
): Promise<string> {
  const result = await runConversation({
    message,
    context: {
      userId: context.userId,
      threadId: context.threadId ?? `temp-${Date.now()}`,
      platform: context.platform ?? "whatsapp",
      customerId: context.customerId ?? "unknown",
    },
  });

  return result.response;
}
