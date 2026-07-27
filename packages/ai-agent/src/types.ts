/**
 * AI Agent Type Definitions
 */

/**
 * Local mirror of packages/api/src/lib/plans.ts's PlanKey — deliberately duplicated
 * rather than importing @acme/api, since this package is kept DB/API-agnostic (see
 * BusinessProfileSnapshot below). Values must stay in sync with PLAN_CATALOG's keys.
 */
export type PlanKey = "starter" | "growth" | "pro";

// ============================================
// Configuration
// ============================================

export interface AgentConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Base URL for API (OpenRouter, Azure, etc.) */
  baseUrl?: string;
  /** Model to use */
  model: string;
  /** Temperature */
  temperature?: number;
  /** Max tokens */
  maxTokens?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Subscription plan tier — determines which tools are available (e.g. combo offers,
   * purchase history are excluded for Starter). Defaults to "starter" (most restrictive)
   * if omitted, never to an unlimited tier. */
  planKey?: PlanKey;
}

// ============================================
// Context
// ============================================

export interface ConversationContext {
  /** Platform user ID of the business owner — kept for rows that record "who", not "which store". */
  userId: string;
  /** Store (business) ID — the actual tenant-scoping key. One user can own more than one store. */
  businessId: string;
  /** Thread ID for conversation history */
  threadId: string;
  /** Platform (facebook, instagram, whatsapp) */
  platform: "facebook_page" | "instagram" | "whatsapp";
  /** Customer/sender ID */
  customerId: string;
  /** The customer's real Facebook/Instagram display name (first name), used for a
   * personal greeting — distinct from whatever delivery name they give at checkout,
   * which may belong to someone else (gift orders). Not available for WhatsApp. */
  customerName?: string;
  /** Cached 2-3 sentence AI summary of this conversation, refreshed after each reply —
   * covers anything said earlier than the raw message history window below can reach
   * (e.g. an allergy or complaint mentioned 20+ messages ago). May be one turn stale. */
  conversationSummary?: string;
  /** Connection context for sending messages */
  connectionContext?: ConnectionContext;
  /** Subscription plan tier, used by tool handlers to resolve per-plan limits at call
   * time (e.g. purchase-history depth) via getToolContext(). */
  planKey?: PlanKey;
}

export interface ConnectionContext {
  platform: "facebook_page" | "instagram" | "whatsapp";
  accessToken: string;
  accountId: string;
  recipientId: string;
  connectionId: string;
}

/**
 * Structurally matches (a subset of) the `businessProfile` DB row — kept as a local
 * interface rather than importing @acme/db, since this package is deliberately
 * DB-agnostic and only ever receives data through the injected helpers (see
 * tools/business-tools.ts's BusinessHelpers). Used to build a per-business system prompt
 * instead of the generic, identical-for-every-store prompt this used to be.
 */
export interface BusinessProfileSnapshot {
  name: string;
  description?: string | null;
  industry?: string | null;
  currency?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  /** Custom persona name for the AI to use instead of "the AI sales assistant" */
  agentName?: string | null;
  /** "friendly" | "professional" | "playful" | "formal" */
  conversationTone?: string | null;
  /** "auto" | "bangla" | "english" */
  preferredLanguage?: string | null;
}

// ============================================
// Messages
// ============================================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Image URLs attached to the message */
  images?: string[];
  /** Timestamp */
  timestamp?: Date;
}

export interface AgentInput {
  /** The user's message */
  message: string;
  /** Attached images (URLs or base64) */
  images?: string[];
  /** Conversation context */
  context: ConversationContext;
  /** Previous messages for context */
  history?: ChatMessage[];
}

export interface AgentOutput {
  /** The agent's response */
  response: string;
  /** Tool calls made during processing */
  toolCalls?: ToolCallLog[];
  /** Processing time in ms */
  processingTime: number;
  /** Number of LLM calls */
  llmCalls: number;
  /** Tokens used */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

// ============================================
// Tools
// ============================================

export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, context: ConversationContext) => Promise<unknown>;
}

export interface ToolCallLog {
  name: string;
  input: Record<string, unknown>;
  output: unknown;
  duration: number;
  error?: string;
}

// ============================================
// Logging
// ============================================

export interface AgentLog {
  id: string;
  userId: string;
  threadId: string;
  platform: string;
  input: AgentInput;
  output: AgentOutput;
  toolCalls: ToolCallLog[];
  startedAt: Date;
  completedAt: Date;
  success: boolean;
  error?: string;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ============================================
// State
// ============================================

export interface AgentState {
  messages: ChatMessage[];
  context: ConversationContext;
  toolCalls: ToolCallLog[];
  llmCalls: number;
  startTime: number;
}
